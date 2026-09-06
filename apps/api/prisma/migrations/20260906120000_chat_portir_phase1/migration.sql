-- CreateEnum
CREATE TYPE "public"."ChatSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
CREATE TYPE "public"."ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
CREATE TYPE "public"."ChatMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TYPE "public"."TriageDecision" AS ENUM ('LEGAL', 'NON_LEGAL', 'UNCLEAR');
CREATE TYPE "public"."WorkflowJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "public"."ChatSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "status" "public"."ChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "public"."ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "public"."ChatMessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "triageDecision" "public"."TriageDecision",
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."ChatAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "public"."WorkflowJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "status" "public"."WorkflowJobStatus" NOT NULL DEFAULT 'QUEUED',
    "correlationId" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatSession_workspaceId_updatedAt_idx" ON "public"."ChatSession"("workspaceId", "updatedAt");
CREATE INDEX "ChatSession_createdByUserId_createdAt_idx" ON "public"."ChatSession"("createdByUserId", "createdAt");
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "public"."ChatMessage"("sessionId", "createdAt");
CREATE INDEX "ChatMessage_correlationId_idx" ON "public"."ChatMessage"("correlationId");
CREATE INDEX "ChatAttachment_workspaceId_sessionId_idx" ON "public"."ChatAttachment"("workspaceId", "sessionId");
CREATE INDEX "ChatAttachment_messageId_idx" ON "public"."ChatAttachment"("messageId");
CREATE INDEX "WorkflowJob_workspaceId_createdAt_idx" ON "public"."WorkflowJob"("workspaceId", "createdAt");
CREATE INDEX "WorkflowJob_sessionId_createdAt_idx" ON "public"."WorkflowJob"("sessionId", "createdAt");
CREATE INDEX "WorkflowJob_correlationId_idx" ON "public"."WorkflowJob"("correlationId");

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."WorkflowJob" ADD CONSTRAINT "WorkflowJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."WorkflowJob" ADD CONSTRAINT "WorkflowJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
