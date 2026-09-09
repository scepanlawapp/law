-- AlterTable
ALTER TABLE "public"."ChatSession" ADD COLUMN     "isDeleted" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "ChatSession_createdByUserId_isDeleted_createdAt_idx" ON "public"."ChatSession"("createdByUserId", "isDeleted", "createdAt");