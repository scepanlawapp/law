/*
  Warnings:

  - Added the required column `updatedAt` to the `DraftResult` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "public"."DraftApprovalStatus" AS ENUM ('DRAFT', 'READY_FOR_SIGNOFF', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- DropIndex
DROP INDEX "public"."ChatSession_createdByUserId_createdAt_idx";

-- AlterTable
ALTER TABLE "public"."DraftResult" ADD COLUMN     "approvalStatus" "public"."DraftApprovalStatus" NOT NULL DEFAULT 'READY_FOR_SIGNOFF',
ADD COLUMN     "finalDocumentText" TEXT,
ADD COLUMN     "previousDraftId" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "reviewedAt" TIMESTAMPTZ(3),
ADD COLUMN     "reviewedByUserId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMPTZ(3);

-- Backfill existing rows before enforcing NOT NULL
UPDATE "public"."DraftResult" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;

ALTER TABLE "public"."DraftResult" ALTER COLUMN "updatedAt" SET NOT NULL;

-- CreateIndex
CREATE INDEX "DraftResult_approvalStatus_reviewedAt_idx" ON "public"."DraftResult"("approvalStatus", "reviewedAt");

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_previousDraftId_fkey" FOREIGN KEY ("previousDraftId") REFERENCES "public"."DraftResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;
