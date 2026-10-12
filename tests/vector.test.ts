import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { db } from '../src/lib/db';
import { assertVectorDimensions, embed, VECTOR_DIMENSIONS } from '../src/lib/knowledge';
const enabled = process.env.RUN_DB_TESTS === 'true';
describe.skipIf(!enabled)('vector column contract and HNSW index', () => {
  const prefix = randomUUID();
  let pageId = '', sourceId = '', chunkId = '';
  const unitVector = `[${Array.from({ length: VECTOR_DIMENSIONS }, (_, i) => (i === 0 ? 1 : 0)).join(',')}]`;
  beforeAll(async () => {
    const page = await db.page.create({ data: { metaId: `vector-${prefix}`, name: 'Vector Test Page', demo: true } });
    pageId = page.id;
    const source = await db.knowledgeSource.create({ data: { pageId, title: 'Vector fixture', draft: 'Nội dung kiểm thử vector.', updatedBy: 'vector-test' } });
    sourceId = source.id;
    const chunk = await db.knowledgeChunk.create({ data: { sourceId, text: 'Nội dung kiểm thử vector.' } });
    chunkId = chunk.id;
  });
  afterAll(async () => {
    if (pageId) await db.page.deleteMany({ where: { id: pageId } });
    await db.$disconnect();
  });
  it('rejects a vector whose dimensions differ from the column type', async () => {
    await expect(db.$executeRaw`UPDATE "KnowledgeChunk" SET embedding = '[1,2,3]'::vector WHERE id = ${chunkId}`).rejects.toThrow();
    expect(await db.$executeRaw`UPDATE "KnowledgeChunk" SET embedding = ${unitVector}::vector WHERE id = ${chunkId}`).toBe(1);
    const [row] = await db.$queryRaw<{ dimensions: number }[]>`SELECT vector_dims(embedding) AS dimensions FROM "KnowledgeChunk" WHERE id = ${chunkId}`;
    expect(row.dimensions).toBe(VECTOR_DIMENSIONS);
  });
  it('has the HNSW vector_cosine_ops index on the embedding column', async () => {
    const indexes = await db.$queryRaw<{ indexname: string; amname: string }[]>`
      SELECT i.relname AS indexname, am.amname
      FROM pg_class t
      JOIN pg_index ix ON ix.indrelid = t.oid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_am am ON am.oid = i.relam
      WHERE t.relname = 'KnowledgeChunk' AND i.relname = 'KnowledgeChunk_embedding_hnsw_idx'`;
    expect(indexes).toHaveLength(1);
    expect(indexes[0].amname).toBe('hnsw');
    const [definition] = await db.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes WHERE tablename = 'KnowledgeChunk' AND indexname = 'KnowledgeChunk_embedding_hnsw_idx'`;
    expect(definition.indexdef).toContain('hnsw');
    expect(definition.indexdef).toContain('vector_cosine_ops');
  });
  it('pins the embedding column to vector(1536)', async () => {
    const [column] = await db.$queryRaw<{ type: string }[]>`
      SELECT format_type(a.atttypid, a.atttypmod) AS type
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      WHERE c.relname = 'KnowledgeChunk' AND a.attname = 'embedding' AND NOT a.attisdropped`;
    expect(column.type).toBe(`vector(${VECTOR_DIMENSIONS})`);
  });
  it('does not call the embedding API when dimensions do not match', async () => {
    const names = ['AI_API_KEY', 'AI_EMBEDDING_MODEL', 'AI_EMBEDDING_DIMENSIONS', 'AI_BASE_URL'] as const;
    const saved = names.map(name => [name, process.env[name]] as const);
    try {
      process.env.AI_API_KEY = 'test-key';
      process.env.AI_EMBEDDING_MODEL = 'test-model';
      process.env.AI_EMBEDDING_DIMENSIONS = '3072';
      // Unreachable address: touching the network would raise a transport error, not a dimension error.
      process.env.AI_BASE_URL = 'https://127.0.0.1:9/v1';
      expect(() => assertVectorDimensions()).toThrow(/1536 chiều/);
      await expect(embed(['xin chào'])).rejects.toThrow(/1536 chiều/);
    } finally {
      for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
  });
  it('returns null without a network call when embedding is not configured', async () => {
    const names = ['AI_API_KEY', 'AI_EMBEDDING_MODEL', 'AI_EMBEDDING_DIMENSIONS'] as const;
    const saved = names.map(name => [name, process.env[name]] as const);
    try {
      process.env.AI_API_KEY = '';
      process.env.AI_EMBEDDING_MODEL = '';
      // A mismatched dimension must not matter while embedding stays disabled.
      process.env.AI_EMBEDDING_DIMENSIONS = '3072';
      await expect(embed(['xin chào'])).resolves.toBeNull();
    } finally {
      for (const [name, value] of saved) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    }
  });
});
