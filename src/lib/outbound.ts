import { db } from './db';
import { lockConversation, lockPage } from './locking';
import { allowedToSend, canAiSend } from './security';
import { MetaError, isTokenOrPermissionError, sendMeta } from './meta';
import { tokenFailureFields } from './page-health';
import { notify } from './queue';
import { applyPendingReceipts } from './webhook-processing';
// Meta requests abort after 15s, so takeover waits a little longer than that for an AI
// turn that is already in flight. An accepted message cannot be recalled, so takeover
// must wait for it rather than report control while a stale reply can still land.
const SEND_DRAIN_TIMEOUT_MS = 20000;
type Plan = {
  pageId: string;
  page: { metaId: string; tokenEncrypted: string | null };
  psid: string;
  conversationId: string;
  messageId: string;
  text: string;
  role: string;
  attempts: number;
};
export async function processOutbound(id: string) {
  const job = await db.outboundJob.findUnique({ where: { id } }); if (!job || job.state !== 'PENDING') return;
  // Claim durably before acquiring the send-boundary lock. A crash leaves SENDING,
  // which recovery marks UNCERTAIN rather than sending the same text again.
  const claimed = await db.outboundJob.updateMany({ where: { id, state: 'PENDING', nextAt: { lte: new Date() } }, data: { state: 'SENDING', attempts: { increment: 1 } } });
  if (!claimed.count) return;
  // Phase 1 — decide under the send-boundary advisory lock, then commit *before* talking
  // to Meta. Keeping a transaction open across the network call would pin a pooled
  // connection and hold the Page/conversation lock for up to 15s per send.
  const plan = await db.$transaction(async (tx): Promise<Plan | null> => {
    const pageId = (await tx.conversation.findUniqueOrThrow({ where: { id: job.conversationId } })).pageId;
    await lockPage(tx, pageId);
    await lockConversation(tx, job.conversationId);
    const fresh = await tx.outboundJob.findUniqueOrThrow({ where: { id } });
    if (fresh.state !== 'SENDING') return null;
    // Do not send AI while any earlier durable webhook for the Page awaits application.
    // IGNORED events are excluded: an administrator explicitly accepted that loss.
    const pending = await tx.$queryRaw<{ id: string }[]>`SELECT e.id FROM "WebhookEvent" e WHERE e.state IN ('PENDING','PROCESSING','FAILED') AND EXISTS (SELECT 1 FROM jsonb_array_elements(e.payload->'entry') x WHERE x->>'id'=(SELECT "metaId" FROM "Page" WHERE id=${pageId})) LIMIT 1`;
    const c = await tx.conversation.findUniqueOrThrow({ where: { id: job.conversationId }, include: { page: true } });
    const message = await tx.message.findUniqueOrThrow({ where: { id: job.messageId } });
    if (message.role === 'AI' && pending.length) {
      await tx.outboundJob.update({ where: { id }, data: { state: 'PENDING', nextAt: new Date(Date.now() + 3000) } }); return null;
    }
    if (message.role === 'AI' && (!canAiSend(c.status, c.version, job.version, c.page.aiEnabled) || c.resolved || c.page.knowledgeRevision !== job.knowledgeRevision)) {
      await tx.outboundJob.update({ where: { id }, data: { state: 'CANCELLED' } });
      await tx.message.update({ where: { id: message.id }, data: { state: 'CANCELLED', error: 'AI đã dừng hoặc hội thoại có tin mới' } }); return null;
    }
    if (!allowedToSend(c.lastCustomerAt) || c.page.connection !== 'CONNECTED') {
      await tx.outboundJob.update({ where: { id }, data: { state: 'FAILED', error: 'Ngoài cửa sổ nhắn tin hoặc mất kết nối' } });
      await tx.message.update({ where: { id: message.id }, data: { state: 'FAILED', error: 'Ngoài cửa sổ nhắn tin hoặc mất kết nối' } });
      if (message.role === 'AI') await tx.conversation.update({ where: { id: c.id }, data: { status: 'NEEDS_HUMAN', version: { increment: 1 } } }); return null;
    }
    return { pageId: c.pageId, page: { metaId: c.page.metaId, tokenEncrypted: c.page.tokenEncrypted }, psid: c.psid, conversationId: c.id, messageId: message.id, text: message.text, role: message.role, attempts: fresh.attempts };
  }, { maxWait: 30000, timeout: 25000 });
  // Phase 2 — talk to Meta with no transaction and no advisory lock held.
  if (plan) {
    try {
      const metaId = await sendMeta(plan.page, plan.psid, plan.text);
      await db.$transaction([
        db.message.update({ where: { id: plan.messageId }, data: { metaId, state: 'SENT', sentAt: new Date() } }),
        db.outboundJob.update({ where: { id }, data: { state: 'SENT' } })
      ]);
      // Receipts that arrived before this commit could not match metaId/sentAt. Apply them now,
      // best-effort and outside the transaction: a failure must not undo a confirmed send.
      await applyPendingReceipts(plan.pageId).catch(() => {});
    } catch (error) {
      const e = error instanceof MetaError ? error : new MetaError(0, false, true);
      const retry = e.retryable && !e.uncertain && plan.attempts < 5;
      const state = retry ? 'PENDING' : e.uncertain ? 'UNCERTAIN' : 'FAILED';
      const text = e.uncertain ? 'Không rõ kết quả gửi. Kiểm tra Facebook trước khi gửi lại.' : e.message;
      await db.$transaction(async tx => {
        await tx.outboundJob.update({ where: { id }, data: { state, nextAt: new Date(Date.now() + Math.min(60000, 3000 * 2 ** plan.attempts)), error: text } });
        await tx.message.update({ where: { id: plan.messageId }, data: { state, error: text } });
        if (isTokenOrPermissionError(e.code)) await tx.page.update({ where: { id: plan.pageId }, data: tokenFailureFields(e.message) });
        if (!retry && plan.role === 'AI') await tx.conversation.update({ where: { id: plan.conversationId }, data: { status: 'NEEDS_HUMAN', version: { increment: 1 } } });
      });
    }
  }
  await notify((await db.conversation.findUniqueOrThrow({ where: { id: job.conversationId } })).pageId).catch(() => {});
}
// Takeover calls this after bumping the conversation version. Any AI send already in
// flight belongs to the previous version and cannot be recalled, so we wait for it to
// reach a terminal state instead of letting it land after "you are in control" appears.
// Returns false when the wait timed out; the caller still proceeds (control beats waiting).
export async function waitForAiSends(conversationId: string, timeoutMs = SEND_DRAIN_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const inFlight = await db.outboundJob.findFirst({ where: { conversationId, state: 'SENDING', message: { role: 'AI' } }, select: { id: true } });
    if (!inFlight) return true;
    if (Date.now() >= deadline) return false;
    await new Promise(resolve => setTimeout(resolve, 200));
  }
}
