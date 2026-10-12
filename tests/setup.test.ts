import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../src/lib/db';
import { createFirstAdmin, needsSetup } from '../src/lib/accounts';
const url = process.env.DATABASE_URL || '';
// Destructive: wipes every account, so it only runs on an explicitly marked throwaway database.
const markedDatabase = /(test|setup)/i.test(url) || url.includes(':55432');
const enabled = process.env.RUN_DB_TESTS === 'true' && process.env.RUN_SETUP_TESTS === 'true' && markedDatabase;
describe.skipIf(!enabled)('first-run administrator setup', () => {
  beforeAll(async () => {
    if (!markedDatabase) throw new Error('Refusing to wipe accounts on a database that is not marked for testing');
    await db.user.deleteMany({});
  });
  afterAll(async () => {
    await db.user.deleteMany({});
    await db.auditLog.deleteMany({ where: { action: { in: ['user.setup', 'session.setup-login'] } } });
    await db.$disconnect();
  });
  it('creates the first administrator, then refuses every later attempt', async () => {
    expect(await needsSetup()).toBe(true);
    const admin = await createFirstAdmin({ name: 'Chủ hệ thống', email: 'Owner@Test.local', username: 'ChuHeThong', password: 'first-admin-password' });
    expect(admin.role).toBe('ADMIN');
    expect(admin.email).toBe('owner@test.local');
    expect(admin.username).toBe('chuhethong');
    expect(await needsSetup()).toBe(false);
    await expect(createFirstAdmin({ name: 'Kẻ khác', email: 'other@test.local', username: 'keakhac', password: 'first-admin-password' })).rejects.toMatchObject({ status: 409 });
  });
  it('creates exactly one administrator when two first-run requests race', async () => {
    await db.user.deleteMany({});
    expect(await needsSetup()).toBe(true);
    const attempt = (index: number) => createFirstAdmin({ name: `Racer ${index}`, email: `racer${index}@test.local`, username: `racer${index}`, password: 'racing-admin-password' });
    const results = await Promise.allSettled([attempt(1), attempt(2), attempt(3)]);
    const created = results.filter(result => result.status === 'fulfilled');
    expect(created).toHaveLength(1);
    expect(await db.user.count()).toBe(1);
    expect(await db.user.count({ where: { role: 'ADMIN' } })).toBe(1);
    for (const rejected of results.filter(result => result.status === 'rejected')) expect((rejected as PromiseRejectedResult).reason.status).toBe(409);
  });
});
