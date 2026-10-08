-- Follow-up migration body for case_document_ingestion_20261008. NOT applied
-- in this track.
--
-- Run only after `npm run documents:backfill-content` prints all zeros on
-- every deployment. The text now lives on "DocumentContent"; these legacy
-- per-row copies are dead weight.
--
-- Ship together with, in one change:
--   * removing the schema fields and the ChatAttachmentExtractionStatus enum
--     from apps/api/prisma/schema.prisma;
--   * removing the code that still reads the legacy columns (chat.service
--     attachment text fallback, document promotion, drafting fallbacks, the
--     Task 8/9 legacy fallbacks).
-- ChatAttachmentSourceScript stays: "DocumentContent"."sourceScript" uses it.

ALTER TABLE "DocumentVersion"
  DROP COLUMN "extractionStatus",
  DROP COLUMN "extractedText",
  DROP COLUMN "sourceScript",
  DROP COLUMN "extractionError",
  DROP COLUMN "extractedAt";

ALTER TABLE "ChatAttachment"
  DROP COLUMN "extractionStatus",
  DROP COLUMN "extractedText",
  DROP COLUMN "sourceScript",
  DROP COLUMN "extractionError",
  DROP COLUMN "extractedAt";

DROP TYPE "ChatAttachmentExtractionStatus";
