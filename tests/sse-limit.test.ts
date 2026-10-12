import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
let cookieToken = '';
vi.mock('next/headers', () => ({ cookies: async () => ({ get: () => cookieToken ? { value: cookieToken } : undefined, set: vi.fn(), delete: vi.fn() }) }));
// The queue module is wrapped at file level so a Redis outage can be simulated per test.
// Normally the wrapper delegates to the real implementation (shared-Redis cases below);
// only the in-memory fallback case flips the flag, so both kinds of case coexist here.
const queueFaults = { failAcquire: false };
vi.mock('../src/lib/queue', async importOriginal => {
  const actual = await importOriginal<typeof import('../src/lib/queue')>();
  return {
    ...actual,
    acquireSseSlot: (id: string, max: number, windowMs: number): Promise<boolean> =>
      queueFaults.failAcquire ? Promise.reject(new Error('redis unavailable')) : actual.acquireSseSlot(id, max, windowMs)
  };
});
import { db } from '../src/lib/db';
import { sessionHash } from '../src/lib/auth';
import { hashPassword } from '../src/lib/security';
import { GET as events } from '../src/app/api/events/route';
const enabled = process.env.RUN_DB_TESTS === 'true';
// Same key the route uses through src/lib/queue; assertions read it with a direct client.
const SLOT_KEY = 'pageflow:sse-connections';
const request = () => new Request('http://localhost:3000/api/events', { headers: { accept: 'text/event-stream' } });
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe.skipIf(!enabled)('SSE connection cap', () => {
  let userId = '';
  let redis: Redis;
  async function withCap<T>(value: string, run: () => Promise<T>): Promise<T> {
    const previous = process.env.SSE_MAX_CONNECTIONS;
    process.env.SSE_MAX_CONNECTIONS = value;
    try { return await run(); } finally {
      if (previous === undefined) delete process.env.SSE_MAX_CONNECTIONS; else process.env.SSE_MAX_CONNECTIONS = previous;
    }
  }
  beforeAll(async () => {
    const user = await db.user.create({ data: { email: `sse-${randomUUID()}@test.local`, name: 'SSE Admin', role: 'ADMIN', passwordHash: hashPassword('sse-test-password-1') } });
    userId = user.id;
    cookieToken = randomUUID();
    await db.session.create({ data: { id: sessionHash(cookieToken), userId, csrf: randomUUID(), expiresAt: new Date(Date.now() + 300000) } });
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1 });
    redis.on('error', () => {});
    await redis.del(SLOT_KEY);
  });
  // Slots must never leak between cases, otherwise the cap assertions drift.
  afterEach(async () => { await redis.del(SLOT_KEY); });
  afterAll(async () => {
    await redis.del(SLOT_KEY);
    redis.disconnect();
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
    await db.$disconnect();
  });

  describe('shared Redis counter', () => {
    it('refuses a stream beyond the cap and frees the slot when a stream closes', async () => {
      await withCap('1', async () => {
        const first = await events(request());
        expect(first.status).toBe(200);
        expect(await redis.zcard(SLOT_KEY)).toBe(1);
        const refused = await events(request());
        expect(refused.status).toBe(503);
        expect((await refused.json() as { error: string }).error).toContain('giới hạn kết nối');
        // Disconnecting must return the slot, otherwise the server runs out of capacity
        // permanently after the first client closes its tab.
        await first.body?.cancel();
        await wait(250);
        expect(await redis.zcard(SLOT_KEY)).toBe(0);
        const accepted = await events(request());
        expect(accepted.status).toBe(200);
        await accepted.body?.cancel();
        await wait(250);
      });
    });

    it('reclaims slots left behind by instances that died', async () => {
      await withCap('1', async () => {
        // A stale entry would otherwise count towards the cap (1 + 1 > 1) and refuse a
        // connection even though no stream is actually open.
        await redis.zadd(SLOT_KEY, String(Date.now() - 300000), 'dead-instance');
        expect(await redis.zscore(SLOT_KEY, 'dead-instance')).not.toBeNull();
        const stream = await events(request());
        expect(stream.status).toBe(200);
        expect(await redis.zscore(SLOT_KEY, 'dead-instance')).toBeNull();
        expect(await redis.zcard(SLOT_KEY)).toBe(1);
        await stream.body?.cancel();
        await wait(250);
        expect(await redis.zcard(SLOT_KEY)).toBe(0);
      });
    });

    it('releases the Redis slot when the client disconnects', async () => {
      await withCap('1', async () => {
        const stream = await events(request());
        expect(stream.status).toBe(200);
        expect(await redis.zcard(SLOT_KEY)).toBe(1);
        await stream.body?.cancel();
        await wait(250);
        // The connection id is generated inside the route and never exposed, so the
        // release is asserted through the shared cardinality instead of a specific id.
        expect(await redis.zcard(SLOT_KEY)).toBe(0);
      });
    });
  });

  describe('in-memory fallback when Redis is unavailable', () => {
    afterEach(() => { queueFaults.failAcquire = false; });
    it('still enforces the cap when acquireSseSlot throws', async () => {
      queueFaults.failAcquire = true;
      await withCap('1', async () => {
        const first = await events(request());
        expect(first.status).toBe(200);
        // Nothing was reserved in Redis: this connection is counted in process only.
        expect(await redis.zcard(SLOT_KEY)).toBe(0);
        const refused = await events(request());
        expect(refused.status).toBe(503);
        expect((await refused.json() as { error: string }).error).toContain('giới hạn kết nối');
        await first.body?.cancel();
        await wait(50);
        // The in-process counter returned the slot, so a new connection fits again.
        const accepted = await events(request());
        expect(accepted.status).toBe(200);
        await accepted.body?.cancel();
        await wait(50);
      });
    });
  });
});
