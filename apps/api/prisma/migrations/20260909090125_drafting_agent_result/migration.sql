-- CreateTable
CREATE TABLE "public"."DraftResult" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "briefResultId" TEXT,
    "documentText" TEXT NOT NULL,
    "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promptChars" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "model" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DraftResult_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DraftResult_jobId_key" ON "public"."DraftResult"("jobId");

-- CreateIndex
CREATE INDEX "DraftResult_workspaceId_createdAt_idx" ON "public"."DraftResult"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftResult_sessionId_createdAt_idx" ON "public"."DraftResult"("sessionId", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_briefResultId_fkey" FOREIGN KEY ("briefResultId") REFERENCES "public"."BriefExtractionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
