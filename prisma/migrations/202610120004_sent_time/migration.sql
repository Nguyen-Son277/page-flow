ALTER TABLE "Message" ADD COLUMN "sentAt" TIMESTAMP(3);
UPDATE "Message" SET "sentAt"="createdAt" WHERE state IN ('SENT','DELIVERED','READ');
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE;
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE;
