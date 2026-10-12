import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
let cookieToken = '';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, set: vi.fn(), delete: vi.fn() }) }));
import { db } from '../src/lib/db';
import { HttpError, sessionHash } from '../src/lib/auth';
import { hashPassword, verifyPassword } from '../src/lib/security';
import { assertUsernameFree, assertUsernameShape, changeOwnPassword, clearRateLimit, createMember, deleteMember, enforceRateLimit, resetMemberPassword, suggestUsername, updateOwnProfile } from '../src/lib/accounts';
import { POST as login } from '../src/app/api/auth/login/route';
const enabled = process.env.RUN_DB_TESTS === 'true';
const token = randomUUID().slice(0, 8);
const adminUsername = `acctadmin${token}`;
const agentUsername = `acctagent${token}`;
describe.skipIf(!enabled)('account, username and password rules', () => {
  let adminId: string, agentId: string, currentSession: string;
  const adminPassword = 'admin-password-123', agentPassword = 'agent-password-123';
  const loginRequest = (body: unknown, origin = 'http://localhost:3000') => new Request('http://localhost:3000/api/auth/login', { method: 'POST', headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  beforeAll(async () => {
    process.env.APP_URL = 'http://localhost:3000';
    const admin = await db.user.create({ data: { email: `acct-admin-${token}@test.local`, username: adminUsername, name: 'Account Admin', role: 'ADMIN', passwordHash: hashPassword(adminPassword) } }); adminId = admin.id;
    const agent = await db.user.create({ data: { email: `acct-agent-${token}@test.local`, username: agentUsername, name: 'Account Agent', role: 'AGENT', passwordHash: hashPassword(agentPassword) } }); agentId = agent.id;
    currentSession = randomUUID(); await db.session.create({ data: { id: sessionHash(currentSession), userId: adminId, csrf: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
  });
  afterAll(async () => {
    await db.user.deleteMany({ where: { id: { in: [adminId, agentId] } } });
    await db.loginAttempt.deleteMany({ where: { expiresAt: { gt: new Date() } } });
    await db.$disconnect();
  });
  it('normalises usernames and rejects unsafe shapes', () => {
    expect(assertUsernameShape('  Admin.User  ')).toBe('admin.user');
    for (const bad of ['ab', '1admin', 'ad min', 'admin@example.com', 'ad', 'a'.repeat(31), 'admin!']) expect(() => assertUsernameShape(bad)).toThrow(HttpError);
  });
  it('suggests a short username from the email', () => {
    expect(suggestUsername('MinhAnh@congty.vn')).toBe('minhanh');
    expect(suggestUsername('1a@congty.vn')).toBe('');
  });
  it('rejects a username already taken, ignoring letter case', async () => {
    await expect(assertUsernameFree(adminUsername.toUpperCase())).rejects.toThrow(HttpError);
    await expect(assertUsernameFree(adminUsername, adminId)).resolves.toBeUndefined();
  });
  it('creates members with username + password rules enforced', async () => {
    const created = await createMember({ name: 'New Member', email: `member-${token}@test.local`, username: `member${token}`, password: 'member-password-1', role: 'AGENT', actorId: adminId });
    expect(created.role).toBe('AGENT');
    await expect(createMember({ name: 'Dup', email: `dup-${token}@test.local`, username: `MEMBER${token}`, password: 'member-password-1', role: 'AGENT', actorId: adminId })).rejects.toThrow(HttpError);
    await expect(createMember({ name: 'Short', email: `short-${token}@test.local`, username: `shortpwd${token}`, password: 'too-short', role: 'AGENT', actorId: adminId })).rejects.toThrow(HttpError);
    await db.user.deleteMany({ where: { email: { in: [`member-${token}@test.local`, `dup-${token}@test.local`] } } });
  });
  it('signs in with a username or an email and blocks a wrong password', async () => {
    expect((await login(loginRequest({ identifier: adminUsername, password: adminPassword }))).status).toBe(200);
    expect((await login(loginRequest({ identifier: `acct-admin-${token}@test.local`, password: adminPassword }))).status).toBe(200);
    expect((await login(loginRequest({ identifier: adminUsername, password: 'wrong-password-1' }))).status).toBe(401);
    expect((await login(loginRequest({ identifier: adminUsername, password: adminPassword }, 'https://evil.example'))).status).toBe(403);
    await clearRateLimit(`login:${adminUsername}`);
  });
  it('throttles repeated sign-in attempts for one identifier', async () => {
    await clearRateLimit(`probe:${token}`);
    for (let i = 0; i < 3; i++) await enforceRateLimit(`probe:${token}`, 3, 60000, 'Thử lại sau');
    await expect(enforceRateLimit(`probe:${token}`, 3, 60000, 'Thử lại sau')).rejects.toThrow(HttpError);
    await clearRateLimit(`probe:${token}`);
  });
  it('updates name and username, refusing duplicates and invalid values', async () => {
    const updated = await updateOwnProfile(agentId, { name: 'Agent Renamed', username: `agentnew${token}` });
    expect(updated.name).toBe('Agent Renamed'); expect(updated.username).toBe(`agentnew${token}`);
    await expect(updateOwnProfile(agentId, { username: adminUsername })).rejects.toThrow(HttpError);
    await expect(updateOwnProfile(agentId, { name: 'A' })).rejects.toThrow(HttpError);
    await expect(updateOwnProfile(agentId, {})).rejects.toThrow(HttpError);
    await db.user.update({ where: { id: agentId }, data: { username: agentUsername, name: 'Account Agent' } });
  });
  it('changes own password, keeps this session and signs out other devices', async () => {
    const other = randomUUID(); await db.session.create({ data: { id: sessionHash(other), userId: adminId, csrf: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await expect(changeOwnPassword(adminId, 'wrong-current-1', 'brand-new-password-1', sessionHash(currentSession))).rejects.toThrow(HttpError);
    cookieToken = currentSession;
    await changeOwnPassword(adminId, adminPassword, 'brand-new-password-1', sessionHash(currentSession));
    const stored = await db.user.findUniqueOrThrow({ where: { id: adminId } });
    expect(verifyPassword('brand-new-password-1', stored.passwordHash)).toBe(true);
    expect(await db.session.findUnique({ where: { id: sessionHash(currentSession) } })).not.toBeNull();
    expect(await db.session.findUnique({ where: { id: sessionHash(other) } })).toBeNull();
    await expect(changeOwnPassword(adminId, 'brand-new-password-1', 'brand-new-password-1', sessionHash(currentSession))).rejects.toThrow(HttpError);
    await changeOwnPassword(adminId, 'brand-new-password-1', adminPassword, sessionHash(currentSession));
  });
  it('resets a member password and signs that member out everywhere', async () => {
    const session = randomUUID(); await db.session.create({ data: { id: sessionHash(session), userId: agentId, csrf: randomUUID(), expiresAt: new Date(Date.now() + 60000) } });
    await resetMemberPassword(adminId, agentId, 'temporary-password-1');
    expect(await db.session.findMany({ where: { userId: agentId } })).toHaveLength(0);
    await expect(resetMemberPassword(adminId, 'missing-user-id', 'temporary-password-1')).rejects.toThrow(HttpError);
    await expect(resetMemberPassword(adminId, agentId, 'short')).rejects.toThrow(HttpError);
    await db.user.update({ where: { id: agentId }, data: { passwordHash: hashPassword(agentPassword) } });
  });
  it('guards member deletion and keeps conversations intact', async () => {
    await expect(deleteMember(adminId, adminId)).rejects.toThrow(HttpError);
    await expect(deleteMember('someone-else', adminId)).rejects.toThrow(HttpError); // last admin
    const page = await db.page.create({ data: { metaId: `acct-page-${token}`, name: 'Account Page', demo: true } });
    const conversation = await db.conversation.create({ data: { pageId: page.id, psid: `acct-psid-${token}`, customerName: 'Khách', assignedTo: agentId } });
    const message = await db.message.create({ data: { conversationId: conversation.id, role: 'CUSTOMER', text: 'Xin chào' } });
    await deleteMember(adminId, agentId);
    expect(await db.user.findUnique({ where: { id: agentId } })).toBeNull();
    expect((await db.conversation.findUniqueOrThrow({ where: { id: conversation.id } })).assignedTo).toBeNull();
    expect(await db.message.findUnique({ where: { id: message.id } })).not.toBeNull();
    await db.page.delete({ where: { id: page.id } });
  });
});
