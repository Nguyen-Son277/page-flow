import Redis from 'ioredis';
import { Queue } from 'bullmq';
let redis: Redis | undefined, producer: Redis | undefined;
export function getRedis() { return redis ??= new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: null, lazyConnect: true }); }
function getProducer() {
  if (!producer) {
    producer = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', { maxRetriesPerRequest: 1, commandTimeout: 2000, connectTimeout: 2000, enableOfflineQueue: false });
    producer.on('error', () => {});
  }
  return producer;
}
let aiQueue: Queue | undefined;
export function getAiQueue() { return aiQueue ??= new Queue('pageflow-ai', { connection: getProducer() }); }
export function bounded<T>(promise: Promise<T>, ms = 2500): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Redis timeout')), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
// The producer runs with `enableOfflineQueue: false`, so a command issued before the
// connection is ready is rejected outright. That would make the very first SSE connection
// fall back to the in-process counter (and silently drop the first notify), so wait
// briefly for the client to become usable instead of failing on a cold start.
function whenReady(client: Redis, timeoutMs = 400): Promise<void> {
  if (client.status === 'ready') return Promise.resolve();
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout>;
    const onReady = () => { clearTimeout(timer); resolve(); };
    timer = setTimeout(() => { client.off('ready', onReady); reject(new Error('Redis chưa sẵn sàng')); }, timeoutMs);
    client.once('ready', onReady);
  });
}
export async function notify(pageId: string) {
  const producer = getProducer();
  await whenReady(producer);
  await bounded(producer.publish('pageflow-events', JSON.stringify({ pageId, at: Date.now() })));
}
// Shared SSE connection slots, stored as a sorted set scored by the last refresh time.
// Because the set lives in Redis, the cap holds across every server instance rather
// than only inside a single process.
const SSE_SLOT_KEY = 'pageflow:sse-connections';
// windowMs is the slot TTL: an open stream must refresh its score periodically (see
// refreshSseSlot) and entries older than the window belong to instances that died or
// stalled, so acquireSseSlot reclaims them. A stream that fails to refresh within the
// window loses its slot. Slots are always cleaned up explicitly on disconnect, so a
// short TTL only matters when a process dies without running its cleanup.
const SSE_SLOT_TIMEOUT_MS = 800;
// Every Redis command here is bounded: a hung producer must fail fast so the caller can
// fall back to an in-process counter instead of stalling the request.
export async function acquireSseSlot(id: string, max: number, windowMs: number): Promise<boolean> {
  const producer = getProducer();
  await whenReady(producer);
  const now = Date.now();
  await bounded(producer.zremrangebyscore(SSE_SLOT_KEY, '-inf', String(now - windowMs)), SSE_SLOT_TIMEOUT_MS);
  await bounded(producer.zadd(SSE_SLOT_KEY, String(now), id), SSE_SLOT_TIMEOUT_MS);
  const count = await bounded(producer.zcard(SSE_SLOT_KEY), SSE_SLOT_TIMEOUT_MS);
  if (count > max) {
    await bounded(producer.zrem(SSE_SLOT_KEY, id), SSE_SLOT_TIMEOUT_MS);
    return false;
  }
  return true;
}
// Renews the slot timestamp so it is not reclaimed as stale while the stream is alive.
export async function refreshSseSlot(id: string): Promise<void> {
  const producer = getProducer();
  await whenReady(producer);
  await bounded(producer.zadd(SSE_SLOT_KEY, String(Date.now()), id), SSE_SLOT_TIMEOUT_MS);
}
// Frees the slot. Redis failures are intentionally propagated (never swallowed) so the
// caller decides how to react; command timeouts reject through bounded().
export async function releaseSseSlot(id: string): Promise<void> {
  const producer = getProducer();
  await whenReady(producer);
  await bounded(producer.zrem(SSE_SLOT_KEY, id), SSE_SLOT_TIMEOUT_MS);
}
export async function scheduleAi(conversationId: string, version: number) {
  const queue = getAiQueue();
  const previous = await bounded(queue.getJob(`${conversationId}-${version}`));
  if (previous && await bounded(previous.getState()) === 'failed') { await bounded(previous.retry()); return; }
  await bounded(queue.add('reply', { conversationId, version }, { jobId: `${conversationId}-${version}`, delay: 3000, attempts: 2, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 200 }));
}
