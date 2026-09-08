CREATE TABLE "BriefExtractionResult" (
  "id" TEXT NOT NULL,
  "jobId" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "messageId" TEXT,
  "brief" JSONB NOT NULL,
  "confidence" DOUBLE PRECISION,
  "missingFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "promptChars" INTEGER NOT NULL,
  "truncated" BOOLEAN NOT NULL DEFAULT false,
  "model" TEXT NOT NULL,
  "errorCode" TEXT,
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BriefExtractionResult_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BriefExtractionResult_jobId_key" ON "BriefExtractionResult"("jobId");
CREATE INDEX "BriefExtractionResult_workspaceId_createdAt_idx" ON "BriefExtractionResult"("workspaceId", "createdAt");
CREATE INDEX "BriefExtractionResult_sessionId_createdAt_idx" ON "BriefExtractionResult"("sessionId", "createdAt");

ALTER TABLE "BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
