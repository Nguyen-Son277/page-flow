ALTER TABLE "Page" ADD COLUMN "knowledgeRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "OutboundJob" ADD COLUMN "knowledgeRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Conversation" ADD COLUMN "lastIncomingAt" TIMESTAMP(3);
UPDATE "Conversation" SET "lastIncomingAt"="lastCustomerAt";
ALTER TABLE "Message" ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Message" SET "receivedAt"="createdAt";
