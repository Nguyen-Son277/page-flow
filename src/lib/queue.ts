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
export async function notify(pageId: string) { await bounded(getProducer().publish('pageflow-events', JSON.stringify({ pageId, at: Date.now() }))); }
export async function scheduleAi(conversationId: string, version: number) {
  const queue = getAiQueue();
  const previous = await bounded(queue.getJob(`${conversationId}-${version}`));
  if (previous && await bounded(previous.getState()) === 'failed') { await bounded(previous.retry()); return; }
  await bounded(queue.add('reply', { conversationId, version }, { jobId: `${conversationId}-${version}`, delay: 3000, attempts: 2, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 200, removeOnFail: 200 }));
}
