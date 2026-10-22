import { db } from './db';
import { answerQuestion } from './ai';
import { jsonEvidence } from './knowledge';
import { lockConversation, lockPage } from './locking';
import { canAiSend } from './security';
import { notify } from './queue';
import { getRuntimeConfig } from './runtime-config';
export async function processAi(conversationId: string, version: number) {
  const conversation = await db.conversation.findUnique({ where: { id: conversationId }, include: { page: true, messages: { where: { role: 'CUSTOMER' }, orderBy: { receivedAt: 'desc' }, take: 10 } } });
  if (!conversation || !canAiSend(conversation.status, conversation.version, version, conversation.page.aiEnabled) || conversation.resolved) return;
  const latest = conversation.messages[0]; if (!latest) return;
  // Only group customer messages since the latest outgoing message.
  const outgoing = await db.message.findFirst({ where: { conversationId, role: { in: ['AI', 'HUMAN'] }, state: { in: ['SENT', 'DELIVERED', 'READ'] } }, orderBy: { createdAt: 'desc' } });
  const grouped = conversation.messages.filter(m => (!outgoing || m.receivedAt > outgoing.createdAt) && latest.receivedAt.getTime() - m.receivedAt.getTime() < 15000).reverse();
  if (!grouped.length) return;
  const question = grouped.map(m => m.text).join('\n').slice(0, 6000);
  let result;
  try { result = await answerQuestion(conversation.page, question); }
  catch { result = { decision: 'NEEDS_HUMAN' as const, answer: null, sources: [], error: 'Không thể tạo câu trả lời có căn cứ. Cần nhân viên.' }; }
  const runtime = await getRuntimeConfig();
  await db.$transaction(async tx => {
    await lockPage(tx, conversation.pageId);
    await lockConversation(tx, conversationId);
    const current = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, include: { page: true } });
    if (!canAiSend(current.status, current.version, version, current.page.aiEnabled) || current.resolved || current.page.knowledgeRevision !== conversation.page.knowledgeRevision) return;
    if (await tx.aiRun.findUnique({ where: { conversationId_controlVersion: { conversationId, controlVersion: version } } })) return;
    await tx.aiRun.create({ data: { conversationId, controlVersion: version, question, answer: result.answer, decision: result.decision, sources: jsonEvidence(result.sources), model: runtime.aiChatModel || 'demo-extractive', error: result.error } });
    if (result.decision === 'NEEDS_HUMAN') {
      await tx.conversation.update({ where: { id: conversationId }, data: { status: 'NEEDS_HUMAN', version: { increment: 1 } } }); return;
    }
    if (!result.answer) return;
    const message = await tx.message.create({ data: { conversationId, role: 'AI', text: result.answer, state: current.page.demo ? 'SENT' : 'PENDING', sentAt: current.page.demo ? new Date() : undefined, idempotencyKey: `ai-${conversationId}-${version}` } });
    await tx.conversation.update({ where: { id: conversationId }, data: { preview: result.answer, lastMessageAt: new Date() } });
    if (!current.page.demo) await tx.outboundJob.create({ data: { messageId: message.id, conversationId, version, knowledgeRevision: current.page.knowledgeRevision } });
  }, { maxWait: 30000, timeout: 30000 });
  await notify(conversation.pageId).catch(() => {});
}
