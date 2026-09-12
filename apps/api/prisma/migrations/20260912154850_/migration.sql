/*
  Warnings:

  - You are about to drop the `BriefExtractionResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatAttachment` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatMessage` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `ChatSession` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `DraftResult` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `WorkflowJob` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "public"."TenantStatus" AS ENUM ('PROVISIONING', 'ACTIVE', 'SUSPENDED');

-- DropForeignKey
ALTER TABLE "public"."BriefExtractionResult" DROP CONSTRAINT "BriefExtractionResult_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."BriefExtractionResult" DROP CONSTRAINT "BriefExtractionResult_messageId_fkey";

-- DropForeignKey
ALTER TABLE "public"."BriefExtractionResult" DROP CONSTRAINT "BriefExtractionResult_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."BriefExtractionResult" DROP CONSTRAINT "BriefExtractionResult_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatAttachment" DROP CONSTRAINT "ChatAttachment_messageId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatAttachment" DROP CONSTRAINT "ChatAttachment_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatAttachment" DROP CONSTRAINT "ChatAttachment_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatMessage" DROP CONSTRAINT "ChatMessage_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatSession" DROP CONSTRAINT "ChatSession_createdByUserId_fkey";

-- DropForeignKey
ALTER TABLE "public"."ChatSession" DROP CONSTRAINT "ChatSession_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_briefResultId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_jobId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_messageId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_previousDraftId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."DraftResult" DROP CONSTRAINT "DraftResult_workspaceId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkflowJob" DROP CONSTRAINT "WorkflowJob_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "public"."WorkflowJob" DROP CONSTRAINT "WorkflowJob_workspaceId_fkey";

-- AlterTable
ALTER TABLE "public"."Workspace" ADD COLUMN     "tenantId" TEXT;

-- DropTable
DROP TABLE "public"."BriefExtractionResult";

-- DropTable
DROP TABLE "public"."ChatAttachment";

-- DropTable
DROP TABLE "public"."ChatMessage";

-- DropTable
DROP TABLE "public"."ChatSession";

-- DropTable
DROP TABLE "public"."DraftResult";

-- DropTable
DROP TABLE "public"."WorkflowJob";

-- DropEnum
DROP TYPE "public"."ChatAttachmentExtractionStatus";

-- DropEnum
DROP TYPE "public"."ChatAttachmentSourceScript";

-- DropEnum
DROP TYPE "public"."ChatMessageRole";

-- DropEnum
DROP TYPE "public"."ChatMessageStatus";

-- DropEnum
DROP TYPE "public"."ChatSessionStatus";

-- DropEnum
DROP TYPE "public"."DraftApprovalStatus";

-- DropEnum
DROP TYPE "public"."TriageDecision";

-- DropEnum
DROP TYPE "public"."WorkflowJobStatus";

-- CreateTable
CREATE TABLE "public"."Tenant" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "schemaName" TEXT NOT NULL,
    "status" "public"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "storagePrefix" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_key_key" ON "public"."Tenant"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_schemaName_key" ON "public"."Tenant"("schemaName");

-- CreateIndex
CREATE INDEX "Workspace_tenantId_idx" ON "public"."Workspace"("tenantId");

-- AddForeignKey
ALTER TABLE "public"."Workspace" ADD CONSTRAINT "Workspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "public"."Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
