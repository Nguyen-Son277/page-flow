import { Worker } from 'bullmq';
import { db } from './lib/db';
import { getRedis, scheduleAi } from './lib/queue';
import { processWebhook, applyPendingReceipts, prunePendingReceipts } from './lib/webhook-processing';
import { processAi } from './lib/ai-processing';
import { processOutbound } from './lib/outbound';
import { checkPageTokens } from './lib/page-health';
const worker = new Worker('pageflow-ai', async job => processAi(job.data.conversationId, job.data.version), { connection: getRedis(), concurrency: 4 });
worker.on('failed', (_job, error) => console.error('AI worker:', error.name));
let stopping = false;
let lastSweep = 0;
async function sweep() {
  // An abandoned send is uncertain, not safe to automatically repeat.
  const stale = await db.outboundJob.findMany({ where: { state: 'SENDING', updatedAt: { lt: new Date(Date.now() - 120000) } } });
  for (const job of stale) await db.$transaction([
    db.outboundJob.updateMany({ where: { id: job.id, state: 'SENDING' }, data: { state: 'UNCERTAIN', error: 'Worker dừng trong lúc gửi. Kiểm tra Facebook trước khi gửi lại.' } }),
    db.message.updateMany({ where: { id: job.messageId, state: 'PENDING' }, data: { state: 'UNCERTAIN', error: 'Kết quả gửi chưa rõ' } })
  ]);
  await db.webhookEvent.updateMany({ where: { state: 'PROCESSING', updatedAt: { lt: new Date(Date.now() - 120000) } }, data: { state: 'PENDING' } });
  // Recover an AI enqueue missed during Redis outage. Queue IDs and message keys prevent duplicates.
  const rows = await db.$queryRaw<{ id: string; version: number }[]>`SELECT c.id, c.version FROM "Conversation" c JOIN "Page" p ON p.id=c."pageId" WHERE c.status='AI_ACTIVE' AND NOT c.resolved AND p."aiEnabled" AND c."lastIncomingAt" < NOW() - INTERVAL '3 seconds' AND NOT EXISTS (SELECT 1 FROM "AiRun" r WHERE r."conversationId"=c.id AND r."controlVersion"=c.version) ORDER BY c."lastIncomingAt" LIMIT 100`;
  // Batch bounded producers; queue outages never hold the durable inbox loop hostage.
  await Promise.all(rows.map(c => scheduleAi(c.id, c.version).catch(() => {})));
  const retentionDays = Number(process.env.RETENTION_DAYS || 0);
  const cutoff = new Date(Date.now() - Math.max(7, retentionDays) * 86400000);
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.loginAttempt.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  await db.metaSelection.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  // Token health runs on every sweep, independently of the opt-in retention block below.
  // A failure inside the check must never break the sweep itself.
  await checkPageTokens().catch(() => {});
  // Receipts parked before their message had metaId/sentAt are retried here; bounded so a
  // large backlog cannot starve the rest of the sweep. One bad Page must not break the sweep.
  const receiptPages = await db.pendingReceipt.findMany({ distinct: ['pageId'], select: { pageId: true }, take: 20 });
  for (const { pageId } of receiptPages) await applyPendingReceipts(pageId).catch(() => {});
  await prunePendingReceipts().catch(() => {});
  // Retention is opt-in. Never delete open conversations or pending sends.
  if (!Number.isFinite(retentionDays) || retentionDays < 7) return;
  await db.conversation.deleteMany({ where: { lastMessageAt: { lt: cutoff }, resolved: true, outbound: { none: { state: { in: ['PENDING', 'SENDING', 'UNCERTAIN'] } } } } });
  await db.webhookEvent.deleteMany({ where: { state: 'DONE', createdAt: { lt: cutoff } } });
  await db.auditLog.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await db.outboundJob.deleteMany({ where: { createdAt: { lt: cutoff }, state: { notIn: ['PENDING', 'SENDING'] } } });
}
async function maintain() {
  while (!stopping) {
    try { if (Date.now() - lastSweep > 60000) { await sweep(); lastSweep = Date.now(); } } catch { console.error('Maintenance failed'); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
async function receive() {
  while (!stopping) {
    try {
      const events = await db.webhookEvent.findMany({ where: { state: 'PENDING', attempts: { lt: 5 } }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const e of events) {
        const claimed = await db.webhookEvent.updateMany({ where: { id: e.id, state: 'PENDING' }, data: { state: 'PROCESSING', attempts: { increment: 1 } } });
        if (!claimed.count) continue;
        try { await processWebhook(e.payload); await db.webhookEvent.update({ where: { id: e.id }, data: { state: 'DONE', error: null } }); }
        catch { await db.webhookEvent.update({ where: { id: e.id }, data: { state: e.attempts >= 4 ? 'FAILED' : 'PENDING', error: 'Không xử lý được sự kiện' } }); }
      }
    } catch (error) { console.error('Receive worker:', error instanceof Error ? error.name : 'Unknown'); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
async function send() {
  while (!stopping) {
    try {
      const jobs = await db.outboundJob.findMany({ where: { state: 'PENDING', nextAt: { lte: new Date() } }, orderBy: { createdAt: 'asc' }, take: 20 });
      for (const job of jobs) await processOutbound(job.id);
    } catch (error) { console.error('Poll worker:', error instanceof Error ? error.name : 'Unknown'); }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
process.on('SIGTERM', () => { stopping = true; });
process.on('SIGINT', () => { stopping = true; });
Promise.all([maintain(), receive(), send()]).finally(async () => { await worker.close(); getRedis().disconnect(); await db.$disconnect(); });
console.log('PageFlow worker ready');
