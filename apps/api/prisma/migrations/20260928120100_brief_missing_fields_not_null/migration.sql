-- Required Json field (the former scalar list column was nullable).
UPDATE "BriefExtractionResult" SET "missingFields" = '[]' WHERE "missingFields" IS NULL;
ALTER TABLE "BriefExtractionResult" ALTER COLUMN "missingFields" SET NOT NULL;
