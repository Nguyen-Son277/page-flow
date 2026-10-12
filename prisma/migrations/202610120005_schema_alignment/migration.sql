ALTER TABLE "AiRun" ALTER COLUMN "controlVersion" DROP DEFAULT;
ALTER TABLE "OutboundJob" DROP CONSTRAINT "OutboundJob_messageId_fkey";
ALTER TABLE "OutboundJob" DROP CONSTRAINT "OutboundJob_conversationId_fkey";
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"(id) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OutboundJob" ADD CONSTRAINT "OutboundJob_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"(id) ON DELETE CASCADE ON UPDATE CASCADE;
