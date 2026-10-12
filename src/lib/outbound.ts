import { db } from './db';
import { lockConversation, lockPage } from './locking';
import { allowedToSend, canAiSend } from './security';
import { MetaError, sendMeta } from './meta';
import { notify } from './queue';
export async function processOutbound(id: string) {
  const job = await db.outboundJob.findUnique({ where: { id } }); if (!job || job.state !== 'PENDING') return;
  // Claim durably before acquiring the send-boundary lock. A crash leaves SENDING,
  // which recovery marks UNCERTAIN rather than sending the same text again.
  const claimed = await db.outboundJob.updateMany({ where: { id, state: 'PENDING', nextAt: { lte: new Date() } }, data: { state: 'SENDING', attempts: { increment: 1 } } });
  if (!claimed.count) return;
  // Serialize takeover and send boundary with the same database advisory lock.
  await db.$transaction(async tx => {
    const pageId = (await tx.conversation.findUniqueOrThrow({ where: { id: job.conversationId } })).pageId;
    await lockPage(tx, pageId);
    await lockConversation(tx, job.conversationId);
    const fresh = await tx.outboundJob.findUniqueOrThrow({ where: { id } });
    if (fresh.state !== 'SENDING') return;
    // Do not send AI while any earlier durable webhook for the Page awaits application.
    const pending = await tx.$queryRaw<{ id: string }[]>`SELECT e.id FROM "WebhookEvent" e WHERE e.state IN ('PENDING','PROCESSING','FAILED') AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.payload->'entry') x WHERE x->>'id'=(SELECT "metaId" FROM "Page" WHERE id=${pageId})) LIMIT 1`;
    const c = await tx.conversation.findUniqueOrThrow({ where: { id: job.conversationId }, include: { page: true } });
    const message = await tx.message.findUniqueOrThrow({ where: { id: job.messageId } });
    if (message.role === 'AI' && pending.length) {
      await tx.outboundJob.update({ where: { id }, data: { state: 'PENDING', nextAt: new Date(Date.now() + 3000) } }); return;
    }
    if (message.role === 'AI' && (!canAiSend(c.status, c.version, job.version, c.page.aiEnabled) || c.resolved || c.page.knowledgeRevision !== job.knowledgeRevision)) {
      await tx.outboundJob.update({ where: { id }, data: { state: 'CANCELLED' } });
      await tx.message.update({ where: { id: message.id }, data: { state: 'CANCELLED', error: 'AI đã dừng hoặc hội thoại có tin mới' } }); return;
    }
    if (!allowedToSend(c.lastCustomerAt) || c.page.connection !== 'CONNECTED') {
      await tx.outboundJob.update({ where: { id }, data: { state: 'FAILED', error: 'Ngoài cửa sổ nhắn tin hoặc mất kết nối' } });
      await tx.message.update({ where: { id: message.id }, data: { state: 'FAILED', error: 'Ngoài cửa sổ nhắn tin hoặc mất kết nối' } });
      if (message.role === 'AI') await tx.conversation.update({ where: { id: c.id }, data: { status: 'NEEDS_HUMAN', version: { increment: 1 } } }); return;
    }
    try {
      const metaId = await sendMeta(c.page, c.psid, message.text);
      await tx.message.update({ where: { id: message.id }, data: { metaId, state: 'SENT', sentAt: new Date() } });
      await tx.outboundJob.update({ where: { id }, data: { state: 'SENT' } });
    } catch (error) {
      const e = error instanceof MetaError ? error : new MetaError(0, false, true);
      const retry = e.retryable && !e.uncertain && fresh.attempts < 5;
      const state = retry ? 'PENDING' : e.uncertain ? 'UNCERTAIN' : 'FAILED';
      const text = e.uncertain ? 'Không rõ kết quả gửi. Kiểm tra Facebook trước khi gửi lại.' : e.message;
      await tx.outboundJob.update({ where: { id }, data: { state, nextAt: new Date(Date.now() + Math.min(60000, 3000 * 2 ** fresh.attempts)), error: text } });
      await tx.message.update({ where: { id: message.id }, data: { state, error: text } });
      if (e.code === 190 || e.code === 200) await tx.page.update({ where: { id: c.pageId }, data: { connection: 'ERROR', aiEnabled: false, lastError: 'Token hết hạn hoặc thiếu quyền; cần kết nối lại' } });
      if (!retry && message.role === 'AI') await tx.conversation.update({ where: { id: c.id }, data: { status: 'NEEDS_HUMAN', version: { increment: 1 } } });
    }
  }, { timeout: 25000, maxWait: 30000 });
  await notify((await db.conversation.findUniqueOrThrow({ where: { id: job.conversationId } })).pageId).catch(() => {});
}
