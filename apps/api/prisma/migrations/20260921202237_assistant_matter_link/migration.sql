-- AlterTable
ALTER TABLE "public"."BriefExtractionResult" ADD COLUMN     "appliedCaseId" TEXT,
ADD COLUMN     "appliedTaskKeys" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "public"."Case" ADD COLUMN     "opposingPartyAddress" TEXT,
ADD COLUMN     "opposingPartyName" TEXT;

-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN     "caseId" TEXT;

-- AlterTable
ALTER TABLE "public"."DraftResult" ADD COLUMN     "caseId" TEXT;

-- CreateIndex
CREATE INDEX "BriefExtractionResult_appliedCaseId_idx" ON "public"."BriefExtractionResult"("appliedCaseId");

-- CreateIndex
CREATE INDEX "ChatSession_workspaceId_caseId_idx" ON "public"."ChatSession"("workspaceId", "caseId");

-- CreateIndex
CREATE INDEX "DraftResult_workspaceId_caseId_idx" ON "public"."DraftResult"("workspaceId", "caseId");

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_appliedCaseId_fkey" FOREIGN KEY ("appliedCaseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;
