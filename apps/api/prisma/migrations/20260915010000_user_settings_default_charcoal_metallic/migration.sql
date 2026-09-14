-- Change the default appearance for newly created UserSettings rows; existing rows are untouched.
ALTER TABLE "UserSettings" ALTER COLUMN "theme" SET DEFAULT 'CHARCOAL';
ALTER TABLE "UserSettings" ALTER COLUMN "finish" SET DEFAULT 'METALLIC';
