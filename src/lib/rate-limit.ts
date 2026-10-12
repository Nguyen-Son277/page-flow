import { createHash } from 'node:crypto';
import { db } from './db';
import { HttpError } from './auth';
/** Reads a positive integer limit from the environment, ignoring unset or invalid values. */
export function limitFromEnv(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}
/**
 * Durable fixed-window throttle. A single atomic upsert increments the counter, so
 * concurrent requests cannot slip past the limit the way a read-then-write check can.
 * The window never slides: it starts on the first hit and resets once it expires.
 * Throws HttpError(429) as soon as the window already holds `limit` hits.
 */
export async function enforceRateLimit(key: string, limit: number, windowMs: number, message: string) {
  const id = createHash('sha256').update(key).digest('hex');
  const expiresAt = new Date(Date.now() + windowMs);
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "LoginAttempt" ("key", "count", "expiresAt")
    VALUES (${id}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "LoginAttempt"."expiresAt" <= NOW() THEN 1 ELSE "LoginAttempt"."count" + 1 END,
      "expiresAt" = CASE WHEN "LoginAttempt"."expiresAt" <= NOW() THEN ${expiresAt} ELSE "LoginAttempt"."expiresAt" END
    RETURNING "count"`;
  if ((rows[0]?.count ?? 1) > limit) throw new HttpError(429, message);
}
export async function clearRateLimit(key: string) {
  await db.loginAttempt.deleteMany({ where: { key: createHash('sha256').update(key).digest('hex') } });
}
// Hosts, IPv4 and IPv6 as they appear in proxy headers; anything else is rejected so a
// crafted header cannot blow up the throttle key space.
const IP_PATTERN = /^[0-9a-fA-F:.]{3,45}$/;
/**
 * Best-effort caller address. `x-forwarded-for` is a comma-separated chain whose first
 * entry is the originating client — it is only trustworthy when a reverse proxy you
 * control overwrites the header; otherwise callers can spoof it.
 */
export function clientIp(req: Request) {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const candidate = forwarded || req.headers.get('x-real-ip')?.trim() || '';
  return IP_PATTERN.test(candidate) ? candidate : 'unknown';
}
export function requestKey(req: Request, scope: string) {
  return `${scope}:${clientIp(req)}`;
}
