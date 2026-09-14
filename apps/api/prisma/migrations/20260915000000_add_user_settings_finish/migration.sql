-- Add the finish (premium texture) preference, defaulting existing rows to SOLID.
ALTER TABLE "UserSettings" ADD COLUMN "finish" TEXT NOT NULL DEFAULT 'SOLID';
