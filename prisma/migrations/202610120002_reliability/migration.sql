ALTER TABLE "Page" ADD COLUMN "lastWebhookAt" TIMESTAMP(3);
ALTER TABLE "KnowledgeSource" ADD COLUMN "embeddingConfig" TEXT;
ALTER TABLE "AiRun" ADD COLUMN "controlVersion" INTEGER NOT NULL DEFAULT 0;
-- Preserve multiple pre-versioned historical runs using distinct negative versions.
WITH ranked AS (SELECT id, -ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", id)::INTEGER AS v FROM "AiRun")
UPDATE "AiRun" a SET "controlVersion"=r.v FROM ranked r WHERE a.id=r.id;
CREATE UNIQUE INDEX "AiRun_conversationId_controlVersion_key" ON "AiRun"("conversationId", "controlVersion");
CREATE TABLE "MetaSelection" (
 "id" TEXT PRIMARY KEY,
 "userId" TEXT NOT NULL,
 "pagesEncrypted" TEXT NOT NULL,
 "expiresAt" TIMESTAMP(3) NOT NULL
);
