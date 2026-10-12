import { db } from './db';
import { lockPage } from './locking';
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
// The embedding column is pinned to 1536 dimensions because the HNSW index needs
// an explicit dimension count. Switching to another size requires a migration that
// alters the column type, followed by `pnpm db:reindex`.
export const VECTOR_DIMENSIONS = 1536;
// Fail fast when AI_EMBEDDING_DIMENSIONS disagrees with the fixed column width, so
// we never send mismatched vectors to PostgreSQL or query a wrongly sized index.
export function assertVectorDimensions() {
  const configured = Number(process.env.AI_EMBEDDING_DIMENSIONS || VECTOR_DIMENSIONS);
  if (configured !== VECTOR_DIMENSIONS) throw new Error('Cột vector cố định 1536 chiều. Đặt AI_EMBEDDING_DIMENSIONS=1536 hoặc đổi kiểu cột bằng migration rồi chạy pnpm db:reindex.');
}
export function splitChunks(text: string, size = 1000) {
  const parts: string[] = [];
  for (let i = 0; i < text.length; i += size - 150) parts.push(text.slice(i, i + size));
  return parts;
}
export async function aiRequest(path: string, body: unknown) {
  if (!process.env.AI_API_KEY) throw new Error('Chưa cấu hình AI');
  const base = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
  const url = new URL(`${base.replace(/\/$/, '')}/${path}`);
  if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.hostname === 'localhost')) throw new Error('AI endpoint cần HTTPS');
  const r = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) });
  if (!r.ok) throw new Error(`Dịch vụ AI lỗi ${r.status}`);
  return r.json();
}
export async function embed(texts: string[]): Promise<number[][] | null> {
  if (!process.env.AI_API_KEY || !process.env.AI_EMBEDDING_MODEL) return null;
  // Check before paying for an API call whose vectors could not be stored.
  assertVectorDimensions();
  const r = await aiRequest('embeddings', { model: process.env.AI_EMBEDDING_MODEL, input: texts, dimensions: VECTOR_DIMENSIONS });
  const values = r.data?.sort((a: { index: number }, b: { index: number }) => a.index - b.index).map((x: { embedding: number[] }) => x.embedding);
  if (!Array.isArray(values) || values.length !== texts.length || values.some(v => !Array.isArray(v) || v.length !== VECTOR_DIMENSIONS || !v.every(Number.isFinite))) throw new Error('Embedding không hợp lệ');
  return values;
}
export function embeddingConfig() { return process.env.AI_EMBEDDING_MODEL && process.env.AI_API_KEY ? `${process.env.AI_BASE_URL || 'https://api.openai.com/v1'}|${process.env.AI_EMBEDDING_MODEL}|${process.env.AI_EMBEDDING_DIMENSIONS || '1536'}` : 'lexical-v1'; }
export async function publishSource(id: string, userId: string) {
  const source = await db.knowledgeSource.findUniqueOrThrow({ where: { id } });
  const chunks = splitChunks(source.draft), vectors = await embed(chunks);
  await db.$transaction(async tx => {
    await lockPage(tx, source.pageId);
    // Reject publication if another editor changed the draft while embedding was running.
    const updated = await tx.knowledgeSource.updateMany({ where: { id, updatedAt: source.updatedAt }, data: { published: source.draft, publishedAt: new Date(), embeddingConfig: embeddingConfig(), version: { increment: 1 } } });
    if (!updated.count) throw new Error('Bản nháp đã thay đổi. Vui lòng xuất bản lại');
    await tx.knowledgeChunk.deleteMany({ where: { sourceId: id } });
    for (let i = 0; i < chunks.length; i++) {
      const chunkId = randomUUID();
      await tx.knowledgeChunk.create({ data: { id: chunkId, sourceId: id, text: chunks[i] } });
      if (vectors) await tx.$executeRaw`UPDATE "KnowledgeChunk" SET embedding = ${JSON.stringify(vectors[i])}::vector WHERE id = ${chunkId}`;
    }
    await tx.knowledgeVersion.create({ data: { sourceId: id, version: source.version + 1, content: source.draft, userId } });
    await tx.page.update({ where: { id: source.pageId }, data: { knowledgeRevision: { increment: 1 } } });
    await tx.conversation.updateMany({ where: { pageId: source.pageId, status: 'AI_ACTIVE' }, data: { version: { increment: 1 } } });
  }, { timeout: 30000 });
}
export type Evidence = { id: string; title: string; text: string; score: number };
const tokens = (s: string) => s.toLowerCase().normalize('NFC').match(/[\p{L}\p{N}]+/gu) || [];
export function lexicalScore(question: string, text: string) {
  const stop = new Set(['ạ', 'ơi', 'và', 'là', 'của', 'cho', 'tôi', 'mình', 'bạn', 'có', 'không', 'thì', 'với']);
  const q = [...new Set(tokens(question).filter(t => !stop.has(t)))], t = new Set(tokens(text));
  return q.length ? q.filter(w => t.has(w)).length / q.length : 0;
}
export async function retrieve(pageId: string, question: string): Promise<Evidence[]> {
  const config = embeddingConfig();
  // With a real embedding backend enabled a dimension mismatch must surface as
  // NEEDS_HUMAN instead of searching an index built for another vector size.
  if (config !== 'lexical-v1') assertVectorDimensions();
  if (config !== 'lexical-v1' && await db.knowledgeSource.count({ where: { pageId, publishedAt: { not: null }, OR: [{ embeddingConfig: { not: config } }, { embeddingConfig: null }] } })) throw new Error('Cấu hình embedding đã đổi. Xuất bản lại nguồn để lập chỉ mục.');
  const vectors = await embed([question]);
  if (vectors) {
    const results = await db.$queryRaw<(Evidence & { distance: number })[]>`SELECT c.id, s.title, c.text, (c.embedding <=> ${JSON.stringify(vectors[0])}::vector) AS distance FROM "KnowledgeChunk" c JOIN "KnowledgeSource" s ON s.id = c."sourceId" WHERE s."pageId" = ${pageId} AND s."publishedAt" IS NOT NULL AND c.embedding IS NOT NULL ORDER BY distance LIMIT 5`;
    return results.filter(r => r.distance < 0.35).map(r => ({ id: r.id, title: r.title, text: r.text, score: 1 - r.distance }));
  }
  // Conservative lexical fallback, also used by deterministic demo mode.
  const chunks = await db.knowledgeChunk.findMany({ where: { source: { pageId, publishedAt: { not: null } } }, include: { source: { select: { title: true } } }, take: 1000 });
  return chunks.map(c => ({ id: c.id, title: c.source.title, text: c.text, score: lexicalScore(question, c.text) })).filter(c => c.score >= 0.65).sort((a, b) => b.score - a.score).slice(0, 5);
}
export const jsonEvidence = (sources: Evidence[]) => JSON.parse(JSON.stringify(sources)) as Prisma.InputJsonValue;
