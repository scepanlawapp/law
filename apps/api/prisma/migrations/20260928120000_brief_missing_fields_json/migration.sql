-- Structured missing fields ({ key, label }[]). Existing string arrays are kept
-- as JSON string arrays and normalized on read.
ALTER TABLE "BriefExtractionResult" ALTER COLUMN "missingFields" DROP DEFAULT;
ALTER TABLE "BriefExtractionResult"
  ALTER COLUMN "missingFields" TYPE JSONB USING to_jsonb("missingFields");
ALTER TABLE "BriefExtractionResult" ALTER COLUMN "missingFields" SET DEFAULT '[]';
