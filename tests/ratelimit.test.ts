import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { HttpError } from '../src/lib/auth';
import { clearRateLimit, clientIp, enforceRateLimit, requestKey } from '../src/lib/rate-limit';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('durable rate limiting', () => {
  const keys: string[] = [];
  const key = (name: string) => { const value = `ratelimit-${name}-${randomUUID()}`; keys.push(value); return value; };
  afterAll(async () => {
    for (const value of keys) await clearRateLimit(value);
    await db.$disconnect();
  });
  it('allows exactly the configured number of hits and blocks the next one', async () => {
    const target = key('window');
    for (let i = 0; i < 3; i++) await expect(enforceRateLimit(target, 3, 60000, 'Thử lại sau')).resolves.toBeUndefined();
    await expect(enforceRateLimit(target, 3, 60000, 'Thử lại sau')).rejects.toThrow(HttpError);
  });
  it('cannot be bypassed by concurrent requests', async () => {
    const target = key('concurrent');
    const results = await Promise.allSettled(Array.from({ length: 10 }, () => enforceRateLimit(target, 5, 60000, 'Thử lại sau')));
    const allowed = results.filter(result => result.status === 'fulfilled').length;
    const blocked = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    expect(allowed).toBe(5);
    expect(blocked).toHaveLength(5);
    for (const rejected of blocked) expect(rejected.reason).toBeInstanceOf(HttpError);
  });
  it('starts a fresh window once the old one expires', async () => {
    const target = key('expiry');
    await enforceRateLimit(target, 1, 60, 'Thử lại sau');
    await expect(enforceRateLimit(target, 1, 60, 'Thử lại sau')).rejects.toThrow(HttpError);
    await new Promise(resolve => setTimeout(resolve, 120));
    await expect(enforceRateLimit(target, 1, 60, 'Thử lại sau')).resolves.toBeUndefined();
  });
  it('derives the caller address defensively from proxy headers', () => {
    const request = (headers: Record<string, string>) => new Request('http://localhost:3000/api/x', { headers });
    expect(clientIp(request({ 'x-forwarded-for': '203.0.113.7, 10.0.0.1, 10.0.0.2' }))).toBe('203.0.113.7');
    expect(clientIp(request({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
    // Junk and oversized values fall back to a single shared bucket instead of exploding keys.
    expect(clientIp(request({ 'x-forwarded-for': '<script>alert(1)</script>' }))).toBe('unknown');
    expect(clientIp(request({ 'x-forwarded-for': 'x'.repeat(500) }))).toBe('unknown');
    expect(clientIp(request({}))).toBe('unknown');
    expect(requestKey(request({ 'x-forwarded-for': '198.51.100.9' }), 'login-ip')).toBe('login-ip:198.51.100.9');
  });
});
