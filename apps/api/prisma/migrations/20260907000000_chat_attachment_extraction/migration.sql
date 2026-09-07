-- CreateEnum
CREATE TYPE "public"."ChatAttachmentExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED');

-- AlterTable
ALTER TABLE "public"."ChatAttachment"
    ADD COLUMN "extractionStatus" "public"."ChatAttachmentExtractionStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "extractedText" TEXT,
    ADD COLUMN "extractionError" TEXT,
    ADD COLUMN "extractedAt" TIMESTAMPTZ(3);
