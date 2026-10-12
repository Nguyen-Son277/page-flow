import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
let cookieToken = '';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/lib/meta', async importOriginal => {
  const original = await importOriginal<typeof import('../src/lib/meta')>();
  return { ...original, sendMeta: vi.fn().mockImplementation(async () => `meta-${randomUUID()}`) };
});
import { db } from '../src/lib/db';
import { sessionHash } from '../src/lib/auth';
import { hashPassword } from '../src/lib/security';
import { processOutbound, waitForAiSends } from '../src/lib/outbound';
import { sendMeta } from '../src/lib/meta';
import { GET as settingsGet, POST as settingsPost } from '../src/app/api/settings/route';
import { POST as conversationPost } from '../src/app/api/conversations/[id]/route';
import { clearRateLimit } from '../src/lib/rate-limit';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('webhook failure recovery and the send boundary', () => {
  const prefix = randomUUID();
  const csrf = randomUUID();
  const metaId = `${prefix}-page`;
  let adminId = '', pageId = '';
  const json = (path: string, body: unknown) => new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'x-csrf-token': csrf }, body: JSON.stringify(body) });
  const takeover = (id: string) => conversationPost(json(`/api/conversations/${id}`, { action: 'takeover' }), { params: Promise.resolve({ id }) });
  // Each test gets its own conversation so ordering cannot leak between cases.
  async function newAiConversation() {
    const conversation = await db.conversation.create({ data: { pageId, psid: `${prefix}-${randomUUID()}`, customerName: 'Khách vận hành', status: 'AI_ACTIVE', version: 1, lastCustomerAt: new Date(), lastIncomingAt: new Date(), lastMessageAt: new Date() } });
    return conversation.id;
  }
  async function queueAiMessage(conversationId: string, text: string) {
    const message = await db.message.create({ data: { conversationId, role: 'AI', text, state: 'PENDING' } });
    const job = await db.outboundJob.create({ data: { conversationId, messageId: message.id, version: 1 } });
    return { conversationId, messageId: message.id, jobId: job.id };
  }
  async function queueHumanMessage(conversationId: string, text: string) {
    const message = await db.message.create({ data: { conversationId, role: 'HUMAN', text, state: 'PENDING' } });
    const job = await db.outboundJob.create({ data: { conversationId, messageId: message.id, version: 1 } });
    return { conversationId, messageId: message.id, jobId: job.id };
  }
  async function addFailedEvent(id: string) {
    await db.webhookEvent.create({ data: { id, state: 'FAILED', attempts: 5, error: 'Không xử lý được sự kiện', payload: { object: 'page', entry: [{ id: metaId, messaging: [{ sender: { id: 'ops-customer' }, message: { mid: `${id}-mid`, text: 'Tin chưa áp dụng' } }] }] } } });
    return id;
  }
  beforeAll(async () => {
    process.env.APP_URL = 'http://localhost:3000';
    process.env.META_SEND_ENABLED = 'true';
    const admin = await db.user.create({ data: { email: `${prefix}@ops.test`, name: 'Ops Admin', passwordHash: hashPassword('a-strong-password'), role: 'ADMIN' } }); adminId = admin.id;
    cookieToken = randomUUID();
    await db.session.create({ data: { id: sessionHash(cookieToken), userId: adminId, csrf, expiresAt: new Date(Date.now() + 300000) } });
    // tokenEncrypted is never decrypted here: sendMeta is mocked for the whole file.
    const page = await db.page.create({ data: { metaId, name: 'Ops Page', demo: false, connection: 'CONNECTED', aiEnabled: true, tokenEncrypted: 'unused-in-tests' } }); pageId = page.id;
  });
  afterAll(async () => {
    await db.webhookEvent.deleteMany({ where: { id: { startsWith: prefix } } });
    await db.page.deleteMany({ where: { id: pageId } });
    await db.session.deleteMany({ where: { id: sessionHash(cookieToken) } });
    await db.auditLog.deleteMany({ where: { userId: adminId } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
  });
  it('waits for an AI turn that is already talking to Meta', async () => {
    const conversationId = await newAiConversation();
    const { jobId } = await queueAiMessage(conversationId, 'Đang gửi');
    await db.outboundJob.update({ where: { id: jobId }, data: { state: 'SENDING' } });
    expect(await waitForAiSends(conversationId, 300)).toBe(false);
    await db.outboundJob.update({ where: { id: jobId }, data: { state: 'SENT' } });
    expect(await waitForAiSends(conversationId, 300)).toBe(true);
  });
  it('does not confirm takeover while an AI reply is in flight', async () => {
    const conversationId = await newAiConversation();
    const { jobId } = await queueAiMessage(conversationId, 'Đang gửi khi tiếp quản');
    await db.outboundJob.update({ where: { id: jobId }, data: { state: 'SENDING' } });
    const started = Date.now();
    const release = new Promise<void>(resolve => { setTimeout(() => { void db.outboundJob.update({ where: { id: jobId }, data: { state: 'SENT' } }).then(() => resolve()); }, 400); });
    const response = await takeover(conversationId);
    await release;
    expect(response.status).toBe(200);
    expect(Date.now() - started).toBeGreaterThanOrEqual(300);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).status).toBe('HUMAN_ACTIVE');
  });
  it('holds AI replies while a webhook event is failed, then replays it', async () => {
    vi.mocked(sendMeta).mockClear();
    const conversationId = await newAiConversation();
    await addFailedEvent(`${prefix}-replay`);
    const blocked = await queueAiMessage(conversationId, 'Không được gửi khi còn sự kiện lỗi');
    await processOutbound(blocked.jobId);
    expect(sendMeta).not.toHaveBeenCalled();
    // Requeued, not dropped: the reply is retried once the event is resolved.
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: blocked.jobId } })).state).toBe('PENDING');
    const listed = await (await settingsGet()).json();
    expect(listed.queue.failedWebhooks).toBeGreaterThanOrEqual(1);
    expect(listed.failedEvents.map((event: { id: string }) => event.id)).toContain(`${prefix}-replay`);
    expect(listed.failedEvents.find((event: { id: string }) => event.id === `${prefix}-replay`).pages).toEqual(['Ops Page']);
    expect((await settingsPost(json('/api/settings', { action: 'webhook-replay', id: `${prefix}-replay` }))).status).toBe(200);
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: `${prefix}-replay` } })).state).toBe('PENDING');
    expect((await settingsPost(json('/api/settings', { action: 'webhook-replay', id: `${prefix}-replay` }))).status).toBe(409);
    // The worker applies the replayed event, which is what actually lifts the block.
    await db.webhookEvent.update({ where: { id: `${prefix}-replay` }, data: { state: 'DONE' } });
    // The blocked attempt was requeued with a short backoff; simulate that time passing.
    await db.outboundJob.update({ where: { id: blocked.jobId }, data: { nextAt: new Date() } });
    await processOutbound(blocked.jobId);
    expect(sendMeta).toHaveBeenCalledTimes(1);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: blocked.jobId } })).state).toBe('SENT');
  });
  it('lets an administrator accept the loss by dismissing a failed event', async () => {
    vi.mocked(sendMeta).mockClear();
    const conversationId = await newAiConversation();
    await addFailedEvent(`${prefix}-dismiss`);
    const blocked = await queueAiMessage(conversationId, 'Gửi sau khi bỏ qua sự kiện lỗi');
    await processOutbound(blocked.jobId);
    expect(sendMeta).not.toHaveBeenCalled();
    expect((await settingsPost(json('/api/settings', { action: 'webhook-dismiss', id: `${prefix}-dismiss` }))).status).toBe(200);
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: `${prefix}-dismiss` } })).state).toBe('IGNORED');
    expect((await settingsPost(json('/api/settings', { action: 'webhook-dismiss', id: `${prefix}-dismiss` }))).status).toBe(409);
    await db.outboundJob.update({ where: { id: blocked.jobId }, data: { nextAt: new Date() } });
    await processOutbound(blocked.jobId);
    expect(sendMeta).toHaveBeenCalledTimes(1);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: blocked.jobId } })).state).toBe('SENT');
    const listed = await (await settingsGet()).json();
    expect(listed.failedEvents.some((event: { id: string }) => event.id === `${prefix}-dismiss`)).toBe(false);
  });
  it('records replay and dismiss in the audit log and rejects non-admins', async () => {
    const agent = await db.user.create({ data: { email: `${prefix}-agent@ops.test`, name: 'Agent', passwordHash: hashPassword('a-strong-password'), role: 'AGENT' } });
    const agentToken = randomUUID(), agentCsrf = randomUUID();
    await db.session.create({ data: { id: sessionHash(agentToken), userId: agent.id, csrf: agentCsrf, expiresAt: new Date(Date.now() + 300000) } });
    await addFailedEvent(`${prefix}-audit`);
    const previous = cookieToken; cookieToken = agentToken;
    const agentRequest = new Request('http://localhost:3000/api/settings', { method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'x-csrf-token': agentCsrf }, body: JSON.stringify({ action: 'webhook-replay', id: `${prefix}-audit` }) });
    expect((await settingsPost(agentRequest)).status).toBe(403);
    expect((await settingsGet()).status).toBe(403);
    cookieToken = previous;
    expect((await db.webhookEvent.findUniqueOrThrow({ where: { id: `${prefix}-audit` } })).state).toBe('FAILED');
    await settingsPost(json('/api/settings', { action: 'webhook-replay', id: `${prefix}-audit` }));
    expect(await db.auditLog.count({ where: { userId: adminId, action: 'webhook.replay', target: `${prefix}-audit` } })).toBe(1);
    await db.session.deleteMany({ where: { userId: agent.id } });
    await db.user.delete({ where: { id: agent.id } });
  });
  it('lists a failed send and re-queues it from the admin screen', async () => {
    vi.mocked(sendMeta).mockClear();
    const conversationId = await newAiConversation();
    // A disconnected Page makes the failure deterministic without mocking a Meta error.
    await db.page.update({ where: { id: pageId }, data: { connection: 'DISCONNECTED' } });
    const blocked = await queueHumanMessage(conversationId, 'Tin nhân viên gửi lỗi');
    await processOutbound(blocked.jobId);
    expect((await db.message.findUniqueOrThrow({ where: { id: blocked.messageId } })).state).toBe('FAILED');
    const listed = await (await settingsGet()).json();
    const item = listed.failedSends.find((send: { id: string }) => send.id === blocked.messageId);
    expect(item).toBeTruthy();
    expect(item.state).toBe('FAILED');
    expect(item.page).toBe('Ops Page');
    expect(item.customer).toBe('Khách vận hành');
    // An administrator reconnects the Page, checks Facebook, then re-queues the send.
    await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED' } });
    expect((await settingsPost(json('/api/settings', { action: 'retry-send', messageId: blocked.messageId }))).status).toBe(200);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: blocked.jobId } })).state).toBe('PENDING');
    await processOutbound(blocked.jobId);
    expect(sendMeta).toHaveBeenCalledTimes(1);
    expect((await db.message.findUniqueOrThrow({ where: { id: blocked.messageId } })).state).toBe('SENT');
    expect((await settingsPost(json('/api/settings', { action: 'retry-send', messageId: blocked.messageId }))).status).toBe(409);
  });
  it('dismisses a send with an unknown outcome and stops counting it', async () => {
    const conversationId = await newAiConversation();
    const { messageId, jobId } = await queueHumanMessage(conversationId, 'Tin chưa rõ kết quả');
    // UNCERTAIN is written by the send worker when Meta neither confirms nor refuses.
    await db.message.update({ where: { id: messageId }, data: { state: 'UNCERTAIN', error: 'Không rõ kết quả gửi' } });
    await db.outboundJob.update({ where: { id: jobId }, data: { state: 'UNCERTAIN' } });
    const before = await (await settingsGet()).json();
    expect(before.failedSends.map((send: { id: string }) => send.id)).toContain(messageId);
    expect((await settingsPost(json('/api/settings', { action: 'dismiss-send', messageId }))).status).toBe(200);
    expect((await db.message.findUniqueOrThrow({ where: { id: messageId } })).state).toBe('DISMISSED');
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: jobId } })).state).toBe('DISMISSED');
    const after = await (await settingsGet()).json();
    expect(after.failedSends.map((send: { id: string }) => send.id)).not.toContain(messageId);
    expect((await settingsPost(json('/api/settings', { action: 'dismiss-send', messageId }))).status).toBe(409);
  });
  it('throttles manual sending per user', async () => {
    const previous = process.env.SEND_RATE_LIMIT;
    process.env.SEND_RATE_LIMIT = '2';
    await clearRateLimit(`send:${adminId}`);
    try {
      await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED' } });
      const conversationId = await newAiConversation();
      const send = (idempotencyKey: string) => conversationPost(json(`/api/conversations/${conversationId}`, { action: 'message', text: 'Xin chào', idempotencyKey }), { params: Promise.resolve({ id: conversationId }) });
      expect((await send(randomUUID())).status).toBe(200);
      expect((await send(randomUUID())).status).toBe(200);
      expect((await send(randomUUID())).status).toBe(429);
    } finally {
      if (previous === undefined) delete process.env.SEND_RATE_LIMIT; else process.env.SEND_RATE_LIMIT = previous;
      await clearRateLimit(`send:${adminId}`);
    }
  });
});
