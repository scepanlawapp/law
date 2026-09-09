-- CreateEnum
CREATE TYPE "public"."ChatAttachmentSourceScript" AS ENUM ('LATIN', 'CYRILLIC', 'MIXED', 'NONE');

-- AlterTable
ALTER TABLE "public"."ChatAttachment" ADD COLUMN     "sourceScript" "public"."ChatAttachmentSourceScript";
