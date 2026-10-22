import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { db } from '@/lib/db';
import { lockPage } from '@/lib/locking';
import { validSignature } from '@/lib/security';
import { getRuntimeConfig } from '@/lib/runtime-config';
export async function GET(req: Request) {
  const runtime = await getRuntimeConfig();
  const p = new URL(req.url).searchParams, token = runtime.metaVerifyToken;
  const actual = Buffer.from(p.get('hub.verify_token') || ''), expected = Buffer.from(token || '');
  if (token && p.get('hub.mode') === 'subscribe' && actual.length === expected.length && timingSafeEqual(actual, expected)) return new Response(p.get('hub.challenge'), { status: 200 });
  return new Response('Forbidden', { status: 403 });
}
const webhook = z.object({ object: z.literal('page'), entry: z.array(z.object({ id: z.string(), messaging: z.array(z.unknown()).optional() }).passthrough()).max(500) }).passthrough();
export async function POST(req: Request) {
  if (Number(req.headers.get('content-length') || 0) > 2_000_000) return new Response('Too large', { status: 413 });
  const body = await req.text();
  if (Buffer.byteLength(body) > 2_000_000) return new Response('Too large', { status: 413 });
  const runtime = await getRuntimeConfig();
  if (!validSignature(body, req.headers.get('x-hub-signature-256'), runtime.metaAppSecret || '')) return new Response('Forbidden', { status: 403 });
  try {
    const data = webhook.parse(JSON.parse(body));
    const id = createHash('sha256').update(body).digest('hex');
    await db.$transaction(async tx => {
      const pages = await tx.page.findMany({ where: { metaId: { in: data.entry.map(e => e.id) } }, orderBy: { id: 'asc' } });
      for (const page of pages) await lockPage(tx, page.id);
      await tx.webhookEvent.upsert({ where: { id }, create: { id, payload: JSON.parse(JSON.stringify(data)) }, update: {} });
    }, { maxWait: 30000, timeout: 30000 });
    // Database acts as a durable inbox; worker polls even if Redis is briefly unavailable.
    return new Response('EVENT_RECEIVED');
  } catch (e) {
    return new Response('Invalid or unavailable', { status: e instanceof z.ZodError || e instanceof SyntaxError ? 400 : 503 });
  }
}
