ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT;
ALTER TABLE "User" ADD COLUMN "username" TEXT;
ALTER TABLE "User" ADD COLUMN "phone" TEXT;
ALTER TABLE "User" ADD COLUMN "jobTitle" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

CREATE TYPE "ThemePreference" AS ENUM ('SYSTEM', 'LIGHT', 'DARK');
CREATE TYPE "LanguagePreference" AS ENUM ('SR', 'EN');
CREATE TYPE "DateTimeFormatPreference" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');

CREATE TABLE "UserSettings" (
  "userId" TEXT NOT NULL,
  "theme" "ThemePreference" NOT NULL DEFAULT 'SYSTEM',
  "language" "LanguagePreference" NOT NULL DEFAULT 'SR',
  "accentColor" TEXT NOT NULL DEFAULT 'BLUE',
  "workspaceNotifications" BOOLEAN NOT NULL DEFAULT true,
  "dateTimeFormat" "DateTimeFormatPreference" NOT NULL DEFAULT 'TWENTY_FOUR_HOUR',
  "timeZone" TEXT NOT NULL DEFAULT 'Europe/Belgrade',
  "createdAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) WITH TIME ZONE NOT NULL,
  CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
