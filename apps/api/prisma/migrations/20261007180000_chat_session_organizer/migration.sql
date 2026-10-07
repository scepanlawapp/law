-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN "pinnedAt" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "ChatSession_workspaceId_status_isDeleted_updatedAt_idx" ON "public"."ChatSession"("workspaceId", "status", "isDeleted", "updatedAt");
