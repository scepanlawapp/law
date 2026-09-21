-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN "category" TEXT;

-- CreateIndex
CREATE INDEX "Document_workspaceId_category_idx" ON "public"."Document"("workspaceId", "category");
