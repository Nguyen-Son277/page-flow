-- CreateIndex
CREATE INDEX "OutboundJob_state_nextAt_idx" ON "OutboundJob"("state", "nextAt");

-- CreateIndex
CREATE INDEX "WebhookEvent_state_createdAt_idx" ON "WebhookEvent"("state", "createdAt");
