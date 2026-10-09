-- CreateEnum
CREATE TYPE "public"."DocumentContentStatus" AS ENUM ('PENDING', 'EXTRACTING', 'EMBEDDING', 'CLASSIFYING', 'READY', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "public"."DocumentKind" AS ENUM ('ID_CARD', 'PASSPORT', 'APR_EXCERPT', 'COURT_DECISION', 'ADMIN_DECISION', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."DocumentFactSubjectType" AS ENUM ('PERSON', 'COMPANY', 'DECISION');

-- AlterTable
ALTER TABLE "public"."ChatAttachment" ADD COLUMN     "contentId" TEXT,
ADD COLUMN     "sha256" TEXT;

-- AlterTable
ALTER TABLE "public"."Document" ADD COLUMN     "aiAccess" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "aiAccessChangedAt" TIMESTAMPTZ(3),
ADD COLUMN     "aiAccessChangedByUserId" TEXT;

-- AlterTable
ALTER TABLE "public"."DocumentVersion" ADD COLUMN     "contentId" TEXT;

-- CreateTable
CREATE TABLE "public"."DocumentContent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "status" "public"."DocumentContentStatus" NOT NULL DEFAULT 'PENDING',
    "failedStep" TEXT,
    "error" TEXT,
    "extractedText" TEXT,
    "sourceScript" "public"."ChatAttachmentSourceScript",
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "pipelineVersion" INTEGER NOT NULL DEFAULT 0,
    "embeddingModel" TEXT,
    "embeddingDimensions" INTEGER,
    "documentKind" "public"."DocumentKind",
    "kindConfidence" DOUBLE PRECISION,
    "processedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DocumentContent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentContentChunk" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "charStart" INTEGER NOT NULL,
    "charEnd" INTEGER NOT NULL,
    "embedding" vector(1024),
    "embeddingModel" TEXT NOT NULL,
    "embeddingDimensions" INTEGER NOT NULL,

    CONSTRAINT "DocumentContentChunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentFact" (
    "id" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "subjectType" "public"."DocumentFactSubjectType" NOT NULL,
    "subjectRole" TEXT,
    "field" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "normalizedValue" TEXT,
    "quote" TEXT NOT NULL,
    "charStart" INTEGER,
    "confidence" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFact_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentContent_workspaceId_status_idx" ON "public"."DocumentContent"("workspaceId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentContent_workspaceId_sha256_key" ON "public"."DocumentContent"("workspaceId", "sha256");

-- CreateIndex
CREATE INDEX "DocumentContentChunk_workspaceId_contentId_idx" ON "public"."DocumentContentChunk"("workspaceId", "contentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentContentChunk_contentId_ordinal_key" ON "public"."DocumentContentChunk"("contentId", "ordinal");

-- CreateIndex
CREATE INDEX "DocumentFact_workspaceId_contentId_idx" ON "public"."DocumentFact"("workspaceId", "contentId");

-- CreateIndex
CREATE INDEX "ChatAttachment_contentId_idx" ON "public"."ChatAttachment"("contentId");

-- CreateIndex
CREATE INDEX "DocumentVersion_contentId_idx" ON "public"."DocumentVersion"("contentId");

-- CreateIndex
CREATE INDEX "StoredFile_workspaceId_sha256_idx" ON "public"."StoredFile"("workspaceId", "sha256");

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."DocumentContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."DocumentContent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentContent" ADD CONSTRAINT "DocumentContent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentContentChunk" ADD CONSTRAINT "DocumentContentChunk_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."DocumentContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentContentChunk" ADD CONSTRAINT "DocumentContentChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentFact" ADD CONSTRAINT "DocumentFact_contentId_fkey" FOREIGN KEY ("contentId") REFERENCES "public"."DocumentContent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentFact" ADD CONSTRAINT "DocumentFact_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
