-- Replace legacy appearance values while preserving all unrelated user settings.
ALTER TABLE "UserSettings"
  ALTER COLUMN "theme" DROP DEFAULT,
  ALTER COLUMN "theme" TYPE TEXT USING "theme"::text;

UPDATE "UserSettings"
SET "theme" = CASE "theme"
  WHEN 'SYSTEM' THEN 'MIDNIGHT'
  WHEN 'DARK' THEN 'MIDNIGHT'
  WHEN 'LIGHT' THEN 'IVORY'
  ELSE "theme"
END,
"accentColor" = CASE "accentColor"
  WHEN 'BLUE' THEN 'ROYAL_BLUE'
  WHEN 'TEAL' THEN 'EMERALD'
  WHEN 'CORAL' THEN 'COPPER'
  WHEN 'VIOLET' THEN 'PURPLE'
  ELSE "accentColor"
END;

DROP TYPE "ThemePreference";

CREATE TYPE "ThemePreference" AS ENUM (
  'MIDNIGHT',
  'DEEP_NAVY',
  'CHARCOAL',
  'DARK_TEAL',
  'BURGUNDY',
  'IVORY'
);

ALTER TABLE "UserSettings"
  ALTER COLUMN "theme" TYPE "ThemePreference"
    USING "theme"::"ThemePreference",
  ALTER COLUMN "theme" SET DEFAULT 'MIDNIGHT';

ALTER TABLE "UserSettings"
  ALTER COLUMN "accentColor" SET DEFAULT 'GOLD';
