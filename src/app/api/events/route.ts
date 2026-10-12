import Redis from 'ioredis';
import { db } from '@/lib/db';
import { requireUser, pageScope, errorResponse, sessionHash } from '@/lib/auth';
import { cookies } from 'next/headers';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const sessionId = sessionHash((await cookies()).get('pageflow_session')!.value);
    async function liveUser() {
      const session = await db.session.findUnique({ where: { id: sessionId }, include: { user: true } });
      return session && session.expiresAt > new Date() ? session.user : null;
    }
    const encoder = new TextEncoder();
    let cleanup: () => void = () => {};
    const stream = new ReadableStream({
      async start(controller) {
        const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1 });
        let closed = false;
        const send = (data: string) => { if (!closed) controller.enqueue(encoder.encode(data)); };
        const interval = setInterval(() => { void liveUser().then(u => u ? send(': heartbeat\n\n') : cleanup()).catch(cleanup); }, 20000);
        cleanup = () => { if (closed) return; closed = true; clearInterval(interval); redis.disconnect(); try { controller.close(); } catch {} };
        req.signal.addEventListener('abort', cleanup, { once: true });
        redis.on('error', cleanup);
        redis.on('message', async (_channel, payload) => {
          try {
            const event = JSON.parse(payload);
            // Recheck membership for each event: revocation takes effect without reconnecting.
            const sessionUser = await liveUser();
            if (!sessionUser) { cleanup(); return; }
            const page = await db.page.findFirst({ where: { id: event.pageId, ...pageScope(sessionUser) }, select: { id: true } });
            if (page) send(`data: ${JSON.stringify({ pageId: page.id })}\n\n`);
          } catch { cleanup(); }
        });
        await redis.subscribe('pageflow-events').catch(cleanup);
        send(': connected\n\n');
      }, cancel() { cleanup(); }
    });
    return new Response(stream, { headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', 'Connection': 'keep-alive', 'X-Accel-Buffering': 'no' } });
  } catch (e) { return errorResponse(e); }
}
