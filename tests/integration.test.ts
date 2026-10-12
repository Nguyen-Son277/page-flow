import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/lib/meta', async importOriginal => {
  const original = await importOriginal<typeof import('../src/lib/meta')>();
  return { ...original, sendMeta: vi.fn().mockImplementation(async () => `meta-${randomUUID()}`) };
});
import { db } from '../src/lib/db';
import { listConversations, unreadIds } from '../src/lib/inbox';
import { publishSource } from '../src/lib/knowledge';
import { answerQuestion } from '../src/lib/ai';
import { processAi } from '../src/lib/ai-processing';
import { processOutbound } from '../src/lib/outbound';
import { processWebhook } from '../src/lib/webhook-processing';
import { sendMeta, MetaError } from '../src/lib/meta';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('isolated PostgreSQL integration', () => {
  const prefix = `test-${randomUUID()}`; let adminId: string, agentId: string, pageId: string, otherPageId: string;
  beforeAll(async () => {
    process.env.AI_API_KEY = ''; process.env.AI_EMBEDDING_MODEL = ''; process.env.META_APP_ID = '123';
    const admin = await db.user.create({ data: { email: `${prefix}@test.local`, name: 'Test', passwordHash: 'unused', role: 'ADMIN' } }); adminId = admin.id;
    const agent = await db.user.create({ data: { email: `${prefix}-agent@test.local`, name: 'Agent', passwordHash: 'unused' } }); agentId = agent.id;
    const page = await db.page.create({ data: { metaId: prefix, name: 'Test Page', demo: true, aiEnabled: true } }); pageId = page.id;
    const other = await db.page.create({ data: { metaId: `${prefix}-other`, name: 'Other Page', demo: true, aiEnabled: true } }); otherPageId = other.id;
    await db.pageMember.create({ data: { pageId, userId: agentId } });
  });
  afterAll(async () => {
    const conversations = await db.conversation.findMany({ where: { pageId: { in: [pageId, otherPageId] } }, select: { id: true } });
    await db.outboundJob.deleteMany({ where: { conversationId: { in: conversations.map(x => x.id) } } });
    await db.page.deleteMany({ where: { id: { in: [pageId, otherPageId] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, agentId] } } }); await db.$disconnect();
  });
  it('paginates >100 conversations and counts unread beyond first page', async () => {
    const at = new Date();
    await db.conversation.createMany({ data: Array.from({ length: 121 }, (_, i) => ({ pageId, psid: `${prefix}-${i}`, customerName: `Customer ${i}`, lastCustomerAt: at, lastIncomingAt: at, lastMessageAt: new Date(at.getTime() - i * 1000) })) });
    const user = { id: agentId, role: 'AGENT' }; const all: string[] = []; let cursor: string | null = null;
    do { const p: URLSearchParams = new URLSearchParams({ filter: 'unread' }); if (cursor) p.set('cursor', cursor); const result = await listConversations(user, p); all.push(...result.items.map(x => x.id)); cursor = result.nextCursor; } while (cursor);
    expect(new Set(all).size).toBe(121); expect((await unreadIds(user)).length).toBe(121);
    const first = all[0]; await db.conversationRead.create({ data: { conversationId: first, userId: agentId, at } });
    expect((await unreadIds(user)).length).toBe(120);
    await db.conversation.update({ where: { id: first }, data: { lastIncomingAt: new Date(at.getTime() + 1000) } }); expect((await unreadIds(user)).length).toBe(121);
    expect((await listConversations(user, new URLSearchParams({ pageId: otherPageId }))).items).toHaveLength(0);
  });
  it('uses only published knowledge for the same Page', async () => {
    const source = await db.knowledgeSource.create({ data: { pageId, title: 'Serum', draft: 'Serum Lumi có giá 350.000đ. Giao hàng trong 3 ngày.', updatedBy: adminId } });
    expect((await answerQuestion({ id: pageId, tone: '', demo: true }, 'Serum Lumi giá')).decision).toBe('NEEDS_HUMAN');
    await publishSource(source.id, adminId);
    expect((await answerQuestion({ id: pageId, tone: '', demo: true }, 'Serum Lumi giá')).decision).toBe('ANSWER');
    expect((await answerQuestion({ id: otherPageId, tone: '', demo: true }, 'Serum Lumi giá')).decision).toBe('NEEDS_HUMAN');
    expect((await answerQuestion({ id: pageId, tone: '', demo: true }, 'Mình muốn gặp nhân viên')).decision).toBe('NEEDS_HUMAN');
  });
  it('does not answer twice on concurrent/repeated AI jobs', async () => {
    const c = await db.conversation.create({ data: { pageId, psid: `${prefix}-ai`, customerName: 'AI test', lastCustomerAt: new Date(), version: 1 } });
    await db.message.create({ data: { conversationId: c.id, role: 'CUSTOMER', text: 'Serum Lumi giá' } });
    await Promise.all([processAi(c.id, 1), processAi(c.id, 1)]); await processAi(c.id, 1);
    expect(await db.message.count({ where: { conversationId: c.id, role: 'AI' } })).toBe(1);
    expect(await db.aiRun.count({ where: { conversationId: c.id } })).toBe(1);
    await db.conversation.update({ where: { id: c.id }, data: { status: 'HUMAN_ACTIVE', version: 2 } });
    await processAi(c.id, 2); expect(await db.aiRun.count({ where: { conversationId: c.id } })).toBe(1);
  });
  it('deduplicates webhook, handles delivery and external human echo', async () => {
    await db.page.update({ where: { id: otherPageId }, data: { demo: false, connection: 'CONNECTED' } });
    const event = { object: 'page', entry: [{ id: `${prefix}-other`, messaging: [{ sender: { id: 'psid-1' }, recipient: { id: `${prefix}-other` }, timestamp: Date.now(), message: { mid: `${prefix}-mid`, text: 'Xin chào' } }] }] };
    await processWebhook(event); await processWebhook(event);
    const c = await db.conversation.findUniqueOrThrow({ where: { pageId_psid: { pageId: otherPageId, psid: 'psid-1' } } });
    expect(await db.message.count({ where: { conversationId: c.id } })).toBe(1);
    await processWebhook({ entry: [{ id: `${prefix}-other`, messaging: [{ sender: { id: `${prefix}-other` }, recipient: { id: 'psid-1' }, message: { mid: `${prefix}-echo`, is_echo: true, app_id: 999, text: 'Nhân viên trả lời' } }] }] });
    expect((await db.conversation.findUniqueOrThrow({ where: { id: c.id } })).status).toBe('HUMAN_ACTIVE');
    await processWebhook({ entry: [{ id: `${prefix}-other`, messaging: [{ message: { mid: `${prefix}-own`, is_echo: true, app_id: 123 }, recipient: { id: 'psid-1' } }] }] });
    expect(await db.message.count({ where: { metaId: `${prefix}-own` } })).toBe(0);
  });
  it('invalidates pending answer on knowledge publication and sees delayed incoming unread', async () => {
    const c = await db.conversation.create({ data: { pageId: otherPageId, psid: `${prefix}-revision`, customerName: 'Revision test', status: 'AI_ACTIVE', version: 1, lastCustomerAt: new Date() } });
    const page = await db.page.findUniqueOrThrow({ where: { id: otherPageId } });
    const message = await db.message.create({ data: { conversationId: c.id, role: 'AI', text: 'old knowledge', state: 'PENDING' } });
    const job = await db.outboundJob.create({ data: { conversationId: c.id, messageId: message.id, version: 1, knowledgeRevision: page.knowledgeRevision } });
    const source = await db.knowledgeSource.create({ data: { pageId: otherPageId, title: 'new', draft: 'Đèn bàn giá 690.000đ.', updatedBy: adminId } });
    await publishSource(source.id, adminId); await processOutbound(job.id);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('CANCELLED');
    const readAt = new Date(Date.now() - 1000); await db.conversationRead.create({ data: { conversationId: c.id, userId: adminId, at: readAt } });
    await processWebhook({ entry: [{ id: `${prefix}-other`, messaging: [{ sender: { id: c.psid }, timestamp: Date.now() - 3600000, message: { mid: `${prefix}-delayed`, text: 'Tin đến trễ' } }] }] });
    expect(await unreadIds({ id: adminId, role: 'ADMIN' })).toContain(c.id);
    const fresh = await db.conversation.findUniqueOrThrow({ where: { id: c.id } });
    const incoming = await db.message.findUniqueOrThrow({ where: { metaId: `${prefix}-delayed` } });
    expect(fresh.lastIncomingAt?.toISOString()).toBe(incoming.receivedAt.toISOString());
  });
  it('cancels stale AI send and never retries uncertain outcomes', async () => {
    const c = await db.conversation.create({ data: { pageId: otherPageId, psid: `${prefix}-send`, customerName: 'Send test', status: 'HUMAN_ACTIVE', version: 2, lastCustomerAt: new Date() } });
    const m = await db.message.create({ data: { conversationId: c.id, role: 'AI', text: 'stale', state: 'PENDING' } });
    const j = await db.outboundJob.create({ data: { conversationId: c.id, messageId: m.id, version: 1 } });
    await processOutbound(j.id); expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).state).toBe('CANCELLED'); expect(sendMeta).not.toHaveBeenCalled();
    const human = await db.message.create({ data: { conversationId: c.id, role: 'HUMAN', text: 'hello', state: 'PENDING' } });
    const job = await db.outboundJob.create({ data: { conversationId: c.id, messageId: human.id, version: 2 } });
    vi.mocked(sendMeta).mockRejectedValueOnce(new MetaError(0, false, true));
    await processOutbound(job.id); await processOutbound(job.id);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('UNCERTAIN'); expect(sendMeta).toHaveBeenCalledTimes(1);
  });
});
