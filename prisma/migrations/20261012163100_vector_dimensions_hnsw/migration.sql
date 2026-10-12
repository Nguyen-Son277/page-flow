-- The HNSW index cannot exist on a vector column without a declared dimension, so the
-- column is pinned to 1536 — the documented default of AI_EMBEDDING_DIMENSIONS.
-- Refuse to run while stored vectors use another dimension instead of silently dropping
-- them; the operator re-indexes first, then applies this migration again.
DO $$
DECLARE different bigint;
BEGIN
  SELECT count(*) INTO different FROM "KnowledgeChunk"
  WHERE embedding IS NOT NULL AND vector_dims(embedding) <> 1536;
  IF different > 0 THEN
    RAISE EXCEPTION 'Có % đoạn kiến thức dùng số chiều khác 1536. Đặt AI_EMBEDDING_DIMENSIONS=1536, chạy "pnpm db:reindex" để lập chỉ mục lại rồi chạy lại migration này.', different;
  END IF;
END $$;
ALTER TABLE "KnowledgeChunk" ALTER COLUMN "embedding" TYPE vector(1536) USING "embedding"::vector(1536);
-- Approximate nearest-neighbour index matching the cosine operator used by retrieval.
CREATE INDEX "KnowledgeChunk_embedding_hnsw_idx" ON "KnowledgeChunk" USING hnsw ("embedding" vector_cosine_ops);
