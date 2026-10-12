import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
let cookieToken = '';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, set: vi.fn(), delete: vi.fn() }) }));
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
import { db } from '../src/lib/db';
import { sessionHash } from '../src/lib/auth';
import { encrypt, hashPassword } from '../src/lib/security';
import { POST as pagesPost } from '../src/app/api/pages/route';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('disconnecting a Facebook Page', () => {
  const prefix = randomUUID();
  const csrf = randomUUID();
  const agentCsrf = randomUUID();
  const metaId = `${prefix}-page`;
  const demoMetaId = `${prefix}-demo`;
  const accessToken = `page-access-${prefix}`;
  let adminId = '', agentId = '', pageId = '', demoPageId = '', conversationId = '', agentToken = '';
  // The route must never reach Meta from a test: the unsubscribe call is stubbed below.
  const fetchMock = vi.fn(async () => new Response('{"success":true}', { status: 200 }));
  const json = (body: unknown, token = csrf) => new Request('http://localhost:3000/api/pages', { method: 'POST', headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json', 'x-csrf-token': token }, body: JSON.stringify(body) });
  beforeAll(async () => {
    process.env.APP_URL = 'http://localhost:3000';
    process.env.META_GRAPH_VERSION = 'v21.0';
    process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
    vi.stubGlobal('fetch', fetchMock);
    const admin = await db.user.create({ data: { email: `${prefix}@pages.test`, name: 'Pages Admin', passwordHash: hashPassword('a-strong-password'), role: 'ADMIN' } }); adminId = admin.id;
    const agent = await db.user.create({ data: { email: `${prefix}-agent@pages.test`, name: 'Pages Agent', passwordHash: hashPassword('a-strong-password'), role: 'AGENT' } }); agentId = agent.id;
    cookieToken = randomUUID();
    agentToken = randomUUID();
    await db.session.create({ data: { id: sessionHash(cookieToken), userId: adminId, csrf, expiresAt: new Date(Date.now() + 300000) } });
    await db.session.create({ data: { id: sessionHash(agentToken), userId: agentId, csrf: agentCsrf, expiresAt: new Date(Date.now() + 300000) } });
    const page = await db.page.create({ data: { metaId, name: 'Pages Test Page', demo: false, connection: 'CONNECTED', aiEnabled: true, tokenEncrypted: encrypt(accessToken), tokenCheckedAt: new Date() } }); pageId = page.id;
    const demoPage = await db.page.create({ data: { metaId: demoMetaId, name: 'Pages Demo Page', demo: true, connection: 'CONNECTED', aiEnabled: true } }); demoPageId = demoPage.id;
    const conversation = await db.conversation.create({ data: { pageId, psid: `${prefix}-customer`, customerName: 'Khách kiểm thử', status: 'AI_ACTIVE', version: 1, lastCustomerAt: new Date(), lastIncomingAt: new Date(), lastMessageAt: new Date() } }); conversationId = conversation.id;
  });
  afterAll(async () => {
    vi.unstubAllGlobals();
    await db.conversation.deleteMany({ where: { pageId: { in: [pageId, demoPageId] } } });
    await db.page.deleteMany({ where: { id: { in: [pageId, demoPageId] } } });
    await db.session.deleteMany({ where: { userId: { in: [adminId, agentId] } } });
    await db.auditLog.deleteMany({ where: { userId: { in: [adminId, agentId] } } });
    await db.user.deleteMany({ where: { id: { in: [adminId, agentId] } } });
    await db.$disconnect();
  });
  it('refuses to disconnect a demo Page', async () => {
    const response = await pagesPost(json({ action: 'disconnect', id: demoPageId }));
    expect(response.status).toBe(400);
    expect((await db.page.findUniqueOrThrow({ where: { id: demoPageId } })).connection).toBe('CONNECTED');
  });
  it('unsubscribes the webhook, clears the token and invalidates waiting AI turns', async () => {
    fetchMock.mockClear();
    const response = await pagesPost(json({ action: 'disconnect', id: pageId }));
    expect(response.status).toBe(200);
    // The webhook is unregistered with the decrypted token before the token row is cleared.
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining(`${metaId}/subscribed_apps`), expect.objectContaining({ method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }));
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.connection).toBe('DISCONNECTED');
    expect(page.aiEnabled).toBe(false);
    expect(page.tokenEncrypted).toBeNull();
    expect(page.tokenCheckedAt).toBeNull();
    // Bumping the version stops an AI turn that is already queued from sending.
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversationId } })).version).toBe(2);
    expect(await db.auditLog.count({ where: { userId: adminId, action: 'page.disconnect', target: pageId } })).toBe(1);
  });
  it('rejects a disconnect with a bad CSRF token', async () => {
    const response = await pagesPost(json({ action: 'disconnect', id: pageId }, randomUUID()));
    expect(response.status).toBe(403);
  });
  it('rejects a disconnect from a non-admin session', async () => {
    const previous = cookieToken; cookieToken = agentToken;
    try {
      const response = await pagesPost(json({ action: 'disconnect', id: pageId }));
      expect(response.status).toBe(403);
    } finally { cookieToken = previous; }
  });
});
