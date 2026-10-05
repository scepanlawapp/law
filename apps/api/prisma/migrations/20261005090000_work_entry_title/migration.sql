-- AlterTable
ALTER TABLE "public"."WorkEntry" ADD COLUMN "title" VARCHAR(200) NOT NULL DEFAULT '';

-- Backfill: first sentence of the description (up to 200 characters), else the
-- start of the description, else "Rad". A candidate must contain a letter or digit.
UPDATE "public"."WorkEntry" AS e
SET "title" = CASE
  WHEN c.first_sentence ~ '[[:alnum:]]' THEN c.first_sentence
  WHEN c.head ~ '[[:alnum:]]' THEN c.head
  ELSE 'Rad'
END
FROM (
  SELECT
    "id",
    left(btrim(substring(btrim("description") from '^[^.!?\n]*[.!?]?')), 200) AS first_sentence,
    left(btrim("description"), 200) AS head
  FROM "public"."WorkEntry"
) AS c
WHERE c."id" = e."id";
