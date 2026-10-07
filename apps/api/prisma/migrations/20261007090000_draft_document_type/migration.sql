-- AlterTable
ALTER TABLE "public"."BriefExtractionResult" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'LAWSUIT';

-- AlterTable
ALTER TABLE "public"."DraftResult" ADD COLUMN "documentType" TEXT NOT NULL DEFAULT 'LAWSUIT';

-- CreateIndex
CREATE INDEX "DraftResult_workspaceId_documentType_idx" ON "public"."DraftResult"("workspaceId", "documentType");
