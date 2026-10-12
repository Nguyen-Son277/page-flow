import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
let cookieToken = '';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
import { db } from '../src/lib/db';
import { sessionHash } from '../src/lib/auth';
import { hashPassword } from '../src/lib/security';
import { POST as login } from '../src/app/api/auth/login/route';
import { GET as bootstrap } from '../src/app/api/bootstrap/route';
import { GET as detail, POST as mutate } from '../src/app/api/conversations/[id]/route';
import { GET as webhookGet, POST as webhookPost } from '../src/app/api/meta/webhook/route';
import { POST as settings } from '../src/app/api/settings/route';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('authenticated API workflow', () => {
  const prefix = randomUUID(); let userId: string, pageId: string, cId: string;
  const csrf = randomUUID();
  function request(path: string, body: unknown, token: string = csrf) { return new Request(`http://localhost:3000${path}`, { method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) }); }
  const ctx = () => ({ params: Promise.resolve({ id: cId }) });
  beforeAll(async () => {
    process.env.APP_URL = 'http://localhost:3000'; process.env.META_VERIFY_TOKEN = 'verify-test';
    const u = await db.user.create({ data: { email: `${prefix}@api.test`, name: 'API test', passwordHash: hashPassword('a-strong-password'), role: 'AGENT' } }); userId = u.id;
    const p = await db.page.create({ data: { metaId: prefix, name: 'Demo', demo: true } }); pageId = p.id;
    await db.pageMember.create({ data: { pageId, userId } });
    const c = await db.conversation.create({ data: { pageId, psid: 'api-customer', customerName: 'Customer', lastCustomerAt: new Date(), lastIncomingAt: new Date() } }); cId = c.id;
    await db.message.create({ data: { conversationId: cId, role: 'CUSTOMER', text: 'Chào shop' } });
    cookieToken = randomUUID(); await db.session.create({ data: { id: sessionHash(cookieToken), userId, csrf, expiresAt: new Date(Date.now() + 60000) } });
  });
  afterAll(async () => {
    await db.page.deleteMany({ where: { id: pageId } }); await db.user.deleteMany({ where: { id: userId } });
    await db.loginAttempt.deleteMany({ where: { expiresAt: { gt: new Date() } } });
    await db.auditLog.deleteMany({ where: { userId } }); await db.$disconnect();
  });
  it('rejects bad login and succeeds valid login', async () => {
    expect((await login(request('/api/auth/login', { email: `${prefix}@api.test`, password: 'wrong' }))).status).toBe(401);
    expect((await login(request('/api/auth/login', { email: `${prefix}@api.test`, password: 'a-strong-password' }))).status).toBe(200);
  });
  it('never returns credential hashes or Page token', async () => {
    const response = await bootstrap(); expect(response.status).toBe(200); const body = await response.text();
    expect(body).not.toContain('passwordHash'); expect(body).not.toContain('tokenEncrypted');
  });
  it('enforces CSRF and admin-only settings', async () => {
    expect((await mutate(request('/api/conversations/x', { action: 'takeover' }, 'bad'), ctx())).status).toBe(403);
    expect((await settings(request('/api/settings', { action: 'create-user' }))).status).toBe(403);
  });
  it('takes over, sends exactly once, reads only viewed timestamp and resumes', async () => {
    expect((await mutate(request('/x', { action: 'takeover' }), ctx())).status).toBe(200);
    const idempotencyKey = randomUUID();
    for (let i = 0; i < 2; i++) expect((await mutate(request('/x', { action: 'message', text: 'Chào bạn', idempotencyKey }), ctx())).status).toBe(200);
    expect(await db.message.count({ where: { conversationId: cId, role: 'HUMAN' } })).toBe(1);
    const data = await (await detail(new Request('http://localhost:3000/x'), ctx())).json();
    expect(data.messages.at(-1).state).toBe('SENT');
    const old = new Date(Date.now() - 10000).toISOString();
    expect((await mutate(request('/x', { action: 'read', seenAt: old }), ctx())).status).toBe(200);
    expect((await db.conversationRead.findUniqueOrThrow({ where: { conversationId_userId: { conversationId: cId, userId } } })).at.toISOString()).toBe(old);
    expect((await mutate(request('/x', { action: 'resume' }), ctx())).status).toBe(200);
    expect((await db.conversation.findUniqueOrThrow({ where: { id: cId } })).status).toBe('AI_ACTIVE');
  });
  it('verifies challenge and rejects unsigned webhook', async () => {
    const r = await webhookGet(new Request('http://localhost:3000/api/meta/webhook?hub.mode=subscribe&hub.verify_token=verify-test&hub.challenge=challenge'));
    expect(await r.text()).toBe('challenge'); expect(r.status).toBe(200);
    expect((await webhookPost(request('/api/meta/webhook', { object: 'page', entry: [] }))).status).toBe(403);
  });
  it('blocks revoked session', async () => {
    await db.session.deleteMany({ where: { id: sessionHash(cookieToken) } }); expect((await bootstrap()).status).toBe(401);
  });
});
