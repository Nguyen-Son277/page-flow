import { db } from './db';
import { audit, HttpError } from './auth';
// Sends that need a human decision: FAILED is definitely undelivered, UNCERTAIN means
// the network outcome was unknown and Facebook may or may not have accepted the text.
const RECOVERABLE = ['FAILED', 'UNCERTAIN'];
const RECONCILE_LIMIT = 10;
export async function listFailedSends() {
  const messages = await db.message.findMany({
    where: { state: { in: RECOVERABLE }, outbound: { isNot: null } },
    orderBy: { createdAt: 'desc' },
    take: RECONCILE_LIMIT,
    select: {
      id: true, role: true, state: true, error: true, text: true, createdAt: true,
      outbound: { select: { attempts: true } },
      conversation: { select: { id: true, customerName: true, page: { select: { name: true, demo: true } } } }
    }
  });
  return messages.map(message => ({
    id: message.id,
    role: message.role,
    state: message.state,
    error: message.error,
    // Preview only: the full text stays in the conversation view.
    preview: message.text.slice(0, 120),
    createdAt: message.createdAt,
    attempts: message.outbound?.attempts ?? 0,
    conversationId: message.conversation.id,
    customer: message.conversation.customerName,
    page: message.conversation.page.name,
    demo: message.conversation.page.demo
  }));
}
/**
 * Re-queues a send whose outcome is known-bad or unknown. Retrying UNCERTAIN is a
 * deliberate human decision, never automatic: Facebook may already have delivered the
 * message, so the operator must check the Page before confirming (surfaced in the UI).
 */
export async function retryFailedSend(actorId: string, messageId: string) {
  const retried = await db.$transaction(async tx => {
    const message = await tx.message.updateMany({ where: { id: messageId, state: { in: RECOVERABLE } }, data: { state: 'PENDING', error: null } });
    if (!message.count) throw new HttpError(409, 'Tin này không còn ở trạng thái cần đối soát');
    const job = await tx.outboundJob.updateMany({ where: { messageId, state: { in: RECOVERABLE } }, data: { state: 'PENDING', nextAt: new Date(), error: null } });
    if (!job.count) throw new HttpError(409, 'Không tìm thấy lượt gửi tương ứng để gửi lại');
    return job.count;
  }, { maxWait: 30000, timeout: 30000 });
  await audit(actorId, 'send.retry', messageId);
  return retried;
}
/** Accepts the loss: the send leaves the reconciliation list and stops inflating the error count. */
export async function dismissFailedSend(actorId: string, messageId: string) {
  await db.$transaction(async tx => {
    const message = await tx.message.updateMany({ where: { id: messageId, state: { in: RECOVERABLE } }, data: { state: 'DISMISSED', error: null } });
    if (!message.count) throw new HttpError(409, 'Tin này không còn ở trạng thái cần đối soát');
    await tx.outboundJob.updateMany({ where: { messageId, state: { in: RECOVERABLE } }, data: { state: 'DISMISSED', error: null } });
  }, { maxWait: 30000, timeout: 30000 });
  await audit(actorId, 'send.dismiss', messageId);
}
