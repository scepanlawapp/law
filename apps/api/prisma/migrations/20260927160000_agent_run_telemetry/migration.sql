-- CreateEnum
CREATE TYPE "public"."AgentToolCallStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- AlterTable
ALTER TABLE "public"."WorkflowJob" ADD COLUMN     "finishedAt" TIMESTAMPTZ(3),
ADD COLUMN     "inputTokens" INTEGER,
ADD COLUMN     "model" TEXT,
ADD COLUMN     "outputTokens" INTEGER,
ADD COLUMN     "startedAt" TIMESTAMPTZ(3);

-- CreateTable
CREATE TABLE "public"."AgentToolCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "toolCallId" TEXT NOT NULL,
    "toolName" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "status" "public"."AgentToolCallStatus" NOT NULL DEFAULT 'RUNNING',
    "errorMessage" TEXT,
    "durationMs" INTEGER,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "AgentToolCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentToolCall_sessionId_startedAt_idx" ON "public"."AgentToolCall"("sessionId", "startedAt");

-- CreateIndex
CREATE INDEX "AgentToolCall_workspaceId_toolName_startedAt_idx" ON "public"."AgentToolCall"("workspaceId", "toolName", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AgentToolCall_jobId_toolCallId_key" ON "public"."AgentToolCall"("jobId", "toolCallId");

-- AddForeignKey
ALTER TABLE "public"."AgentToolCall" ADD CONSTRAINT "AgentToolCall_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentToolCall" ADD CONSTRAINT "AgentToolCall_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AgentToolCall" ADD CONSTRAINT "AgentToolCall_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

