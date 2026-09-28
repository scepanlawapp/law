-- AlterTable
ALTER TABLE "public"."ChatAttachment" ADD COLUMN     "documentId" TEXT;

-- AlterTable
ALTER TABLE "public"."DocumentVersion" ADD COLUMN     "extractedAt" TIMESTAMPTZ(3),
ADD COLUMN     "extractedText" TEXT,
ADD COLUMN     "extractionError" TEXT,
ADD COLUMN     "extractionStatus" "public"."ChatAttachmentExtractionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "sourceScript" "public"."ChatAttachmentSourceScript";

-- CreateIndex
CREATE UNIQUE INDEX "ChatAttachment_documentId_key" ON "public"."ChatAttachment"("documentId");

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

