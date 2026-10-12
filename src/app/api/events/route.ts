import Redis from 'ioredis';
import { randomUUID } from 'node:crypto';
import { db } from '@/lib/db';
import { requireUser, pageScope, errorResponse, sessionHash } from '@/lib/auth';
import { cookies } from 'next/headers';
import { acquireSseSlot, refreshSseSlot, releaseSseSlot } from '@/lib/queue';
export const dynamic = 'force-dynamic';

// One Redis subscriber per browser tab would exhaust the Redis connection pool, so
// concurrent SSE streams are capped. The shared Redis sorted set is the source of truth
// so the cap holds across all server instances; the module-level counter below is only
// a degraded-mode fallback used when Redis itself is unreachable.
const DEFAULT_SSE_MAX_CONNECTIONS = 200;
// A live stream renews its shared slot on every heartbeat, so a slot older than this
// window belongs to an instance that died without cleanup.
const SSE_SLOT_TTL_MS = 90000;
function maxConnections(): number {
  const parsed = Number(process.env.SSE_MAX_CONNECTIONS);
  // Reject empty, non-numeric, fractional and sub-1 values: fall back to the default.
  return Number.isInteger(parsed) && parsed >= 1 ? parsed : DEFAULT_SSE_MAX_CONNECTIONS;
}
let openConnections = 0;

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sessionId = sessionHash((await cookies()).get('pageflow_session')!.value);
    async function liveUser() {
      const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
      return session && session.expiresAt > new Date() ? session.user : null;
    }
    const max = maxConnections();
    const connectionId = randomUUID();
    // Reserve a slot in Redis first: that is the authoritative limit across instances.
    // A rejected reservation means the global cap is reached, while a Redis error means
    // the shared counter is unavailable and this connection drops to the in-memory one.
    let sharedSlots = true;
    try {
      const acquired = await acquireSseSlot(connectionId, max, SSE_SLOT_TTL_MS);
      if (!acquired) {
        return Response.json({ error: 'Máy chủ đã đạt giới hạn kết nối trực tiếp. Vui lòng thử lại sau.' }, { status: 503 });
      }
    } catch { sharedSlots = false; }
    if (!sharedSlots) {
      if (openConnections >= max) {
        return Response.json({ error: 'Máy chủ đã đạt giới hạn kết nối trực tiếp. Vui lòng thử lại sau.' }, { status: 503 });
      }
      // No await between the check above and this increment, so two requests cannot
      // both pass the limit check before either one reserves a slot.
      openConnections += 1;
    }
    const encoder = new TextEncoder();
    // Release guard: flips once, so abort, cancel, Redis errors and the heartbeat
    // cannot free the same slot twice. The mode is fixed at reservation time.
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      if (sharedSlots) void releaseSseSlot(connectionId).catch(() => {});
      else openConnections -= 1;
    };
    let cleanup: () => void = release;
    try {
      const stream = new ReadableStream({
        async start(controller) {
          let client: Redis | null = null;
          let interval: ReturnType<typeof setInterval> | null = null;
          let closed = false;
          const finish = () => {
            if (closed) return;
            closed = true;
            if (interval) clearInterval(interval);
            client?.disconnect();
            release();
            try { controller.close(); } catch {}
          };
          cleanup = finish;
          try {
            const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1 });
            client = redis;
            const send = (data: string) => { if (!closed) controller.enqueue(encoder.encode(data)); };
            interval = setInterval(() => {
              // Renew the shared slot alongside the heartbeat TTL check.
              if (sharedSlots) refreshSseSlot(connectionId).catch(() => {});
              void liveUser().then(u => u ? send(': heartbeat\n\n') : finish()).catch(finish);
            }, 20000);
            req.signal.addEventListener('abort', finish, { once: true });
            redis.on('error', finish);
            redis.on('message', async (_channel, payload) => {
              try {
                const event = JSON.parse(payload);
                // Recheck membership for each event: revocation takes effect without reconnecting.
                const sessionUser = await liveUser();
                if (!sessionUser) { finish(); return; }
                const page = await db.page.findFirst({ where: { id: event.pageId, ...pageScope(sessionUser) }, select: { id: true } });
                if (page) send(`data: ${JSON.stringify({ pageId: page.id })}\n\n`);
              } catch { finish(); }
            });
            await redis.subscribe('pageflow-events');
            send(': connected\n\n');
          } catch { finish(); }
        }, cancel() { cleanup(); }
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' } });
    } catch (e) {
      // Never leak a reservation if the stream/response cannot be built.
      cleanup();
      return errorResponse(e);
    }
  } catch (e) { return errorResponse(e); }
}
