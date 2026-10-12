-- NOTE: `prisma migrate dev` also emitted `DROP INDEX "KnowledgeChunk_embedding_hnsw_idx"`
-- here, because the HNSW index cannot be expressed in schema.prisma. That line was
-- removed on purpose: the index is required for vector search (see README).
-- CreateTable
CREATE TABLE "PendingReceipt" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "metaIds" TEXT[],
    "psid" TEXT,
    "watermark" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PendingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingReceipt_key_key" ON "PendingReceipt"("key");

-- CreateIndex
CREATE INDEX "PendingReceipt_pageId_createdAt_idx" ON "PendingReceipt"("pageId", "createdAt");

-- AddForeignKey
ALTER TABLE "PendingReceipt" ADD CONSTRAINT "PendingReceipt_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "Page"("id") ON DELETE CASCADE ON UPDATE CASCADE;
