import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
// Encrypt real Page tokens so checkPageTokens exercises the decrypt path end to end.
process.env.TOKEN_ENCRYPTION_KEY = 'ab'.repeat(32);
vi.mock('../src/lib/queue', () => ({ notify: vi.fn().mockResolvedValue(undefined), scheduleAi: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/lib/meta', async importOriginal => {
  const original = await importOriginal<typeof import('../src/lib/meta')>();
  return { ...original, metaGet: vi.fn(), sendMeta: vi.fn() };
});
import { db } from '../src/lib/db';
import { hashPassword, encrypt } from '../src/lib/security';
import { MetaError, isTokenOrPermissionError, metaGet, sendMeta } from '../src/lib/meta';
import { TOKEN_FAILURE_PREFIX, checkPageTokens, tokenFailureFields } from '../src/lib/page-health';
import { processOutbound } from '../src/lib/outbound';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('Page token health checks', () => {
  const prefix = randomUUID();
  const metaId = `${prefix}-page`;
  const plainToken = 'page-token';
  let adminId = '', pageId = '';
  beforeAll(async () => {
    process.env.TOKEN_CHECK_HOURS = '6';
    const admin = await db.user.create({ data: { email: `${prefix}@token.test`, name: 'Token Admin', passwordHash: hashPassword('a-strong-password'), role: 'ADMIN' } }); adminId = admin.id;
    // The worker re-checks tokens without an HTTP session; this row only mirrors the
    // account fixtures other database suites create and is removed in afterAll.
    await db.session.create({ data: { id: randomUUID(), userId: adminId, csrf: randomUUID(), expiresAt: new Date(Date.now() + 300000) } });
    const page = await db.page.create({ data: { metaId, name: 'Token Health Page', demo: false, connection: 'CONNECTED', aiEnabled: true, tokenEncrypted: encrypt(plainToken) } }); pageId = page.id;
  });
  afterAll(async () => {
    await db.conversation.deleteMany({ where: { pageId } });
    await db.page.deleteMany({ where: { id: pageId } });
    await db.session.deleteMany({ where: { userId: adminId } });
    await db.auditLog.deleteMany({ where: { userId: adminId } });
    await db.user.deleteMany({ where: { id: adminId } });
    await db.$disconnect();
  });
  it('treats token and permission codes as fatal, but not throttling codes', () => {
    for (const code of [190, 10, 463, 102, 200, 201, 203, 467]) expect(isTokenOrPermissionError(code)).toBe(true);
    for (const code of [4, 17, 32, 613, 999]) expect(isTokenOrPermissionError(code)).toBe(false);
  });
  it('builds a token failure payload that keeps the Graph detail', () => {
    expect(tokenFailureFields()).toEqual({ connection: 'ERROR', aiEnabled: false, lastError: TOKEN_FAILURE_PREFIX });
    const withDetail = tokenFailureFields('Thiếu quyền');
    expect(withDetail.connection).toBe('ERROR');
    expect(withDetail.aiEnabled).toBe(false);
    expect(withDetail.lastError).toBe(`${TOKEN_FAILURE_PREFIX} (Thiếu quyền)`);
    expect(tokenFailureFields('x'.repeat(400)).lastError.length).toBe(300);
  });
  it('disables AI when a send is rejected for a missing permission', async () => {
    await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED', aiEnabled: true, lastError: null } });
    const conversation = await db.conversation.create({ data: { pageId, psid: `${prefix}-${randomUUID()}`, customerName: 'Khách token', status: 'AI_ACTIVE', version: 1, lastCustomerAt: new Date(), lastIncomingAt: new Date(), lastMessageAt: new Date() } });
    const message = await db.message.create({ data: { conversationId: conversation.id, role: 'HUMAN', text: 'Tin nhân viên', state: 'PENDING' } });
    const job = await db.outboundJob.create({ data: { conversationId: conversation.id, messageId: message.id, version: 1 } });
    vi.mocked(sendMeta).mockRejectedValueOnce(new MetaError(10, false, false, 'Thiếu quyền'));
    await processOutbound(job.id);
    expect((await db.outboundJob.findUniqueOrThrow({ where: { id: job.id } })).state).toBe('FAILED');
    expect((await db.message.findUniqueOrThrow({ where: { id: message.id } })).state).toBe('FAILED');
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.connection).toBe('ERROR');
    expect(page.aiEnabled).toBe(false);
    expect(page.lastError).toContain('Thiếu quyền');
  });
  it('skips the sweep entirely when the interval is disabled', async () => {
    const previous = process.env.TOKEN_CHECK_HOURS;
    process.env.TOKEN_CHECK_HOURS = '0';
    try {
      vi.mocked(metaGet).mockClear();
      await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED', aiEnabled: true, lastError: null, tokenCheckedAt: null } });
      expect(await checkPageTokens()).toEqual({ checked: 0, failed: 0 });
      expect(metaGet).not.toHaveBeenCalled();
    } finally {
      if (previous === undefined) delete process.env.TOKEN_CHECK_HOURS; else process.env.TOKEN_CHECK_HOURS = previous;
    }
  });
  it('marks a Page as failed when Graph rejects the token', async () => {
    process.env.TOKEN_CHECK_HOURS = '6';
    vi.mocked(metaGet).mockClear();
    await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED', aiEnabled: true, lastError: null, tokenCheckedAt: null } });
    // Scope the failure to this fixture Page: unrelated Pages in a shared database
    // are still checked by the sweep and must not influence the assertions below.
    vi.mocked(metaGet).mockImplementation(async (path: string) => {
      if (path.startsWith(metaId)) throw new MetaError(190, false, false, 'Token hết hạn');
      return {};
    });
    const result = await checkPageTokens(200);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(1);
    expect(metaGet).toHaveBeenCalledWith(`${metaId}?fields=id`, plainToken);
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.connection).toBe('ERROR');
    expect(page.aiEnabled).toBe(false);
    expect(page.tokenCheckedAt).toBeInstanceOf(Date);
    expect(page.lastError).toContain('Token hết hạn');
  });
  it('keeps a Page connected when the check fails for an unrelated reason', async () => {
    process.env.TOKEN_CHECK_HOURS = '6';
    vi.mocked(metaGet).mockClear();
    await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED', aiEnabled: true, lastError: null, tokenCheckedAt: null } });
    vi.mocked(metaGet).mockImplementation(async (path: string) => {
      if (path.startsWith(metaId)) throw new Error('boom');
      return {};
    });
    const result = await checkPageTokens(200);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.connection).toBe('CONNECTED');
    expect(page.aiEnabled).toBe(true);
    expect(page.tokenCheckedAt).toBeInstanceOf(Date);
  });
  it('clears a previous token warning once the token works again', async () => {
    process.env.TOKEN_CHECK_HOURS = '6';
    vi.mocked(metaGet).mockClear();
    await db.page.update({ where: { id: pageId }, data: { connection: 'CONNECTED', aiEnabled: false, lastError: `${TOKEN_FAILURE_PREFIX} (lần trước)`, tokenCheckedAt: new Date(Date.now() - 86400000) } });
    vi.mocked(metaGet).mockImplementation(async (path: string) => path.startsWith(metaId) ? { id: metaId } : {});
    const result = await checkPageTokens(200);
    expect(result.checked).toBeGreaterThanOrEqual(1);
    expect(result.failed).toBe(0);
    const page = await db.page.findUniqueOrThrow({ where: { id: pageId } });
    expect(page.tokenCheckedAt).toBeInstanceOf(Date);
    expect(page.lastError).toBeNull();
  });
});
