-- CreateEnum
CREATE TYPE "public"."PendingActionStatus" AS ENUM ('PENDING', 'EXECUTING', 'APPROVED', 'DECLINED', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "public"."WorkflowJobStatus" ADD VALUE 'WAITING_CONFIRMATION';

-- CreateTable
CREATE TABLE "public"."PendingAction" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "correlationId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "summary" TEXT NOT NULL,
    "details" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "public"."PendingActionStatus" NOT NULL DEFAULT 'PENDING',
    "idempotencyKey" TEXT NOT NULL,
    "result" JSONB,
    "errorMessage" TEXT,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedByUserId" TEXT,
    "decidedAt" TIMESTAMPTZ(3),
    "declineReason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PendingAction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PendingAction_idempotencyKey_key" ON "public"."PendingAction"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PendingAction_sessionId_createdAt_idx" ON "public"."PendingAction"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "PendingAction_jobId_status_idx" ON "public"."PendingAction"("jobId", "status");

-- AddForeignKey
ALTER TABLE "public"."PendingAction" ADD CONSTRAINT "PendingAction_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingAction" ADD CONSTRAINT "PendingAction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PendingAction" ADD CONSTRAINT "PendingAction_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

