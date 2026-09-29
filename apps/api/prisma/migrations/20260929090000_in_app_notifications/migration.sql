-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM (
  'DEADLINE_ASSIGNED',
  'DEADLINE_DUE_SOON',
  'DEADLINE_DUE_TODAY',
  'DEADLINE_OVERDUE',
  'DEADLINE_CHANGED',
  'TASK_ASSIGNED',
  'TASK_DUE_SOON',
  'TASK_DUE_TODAY',
  'TASK_OVERDUE',
  'EVENT_UPCOMING',
  'EVENT_CHANGED',
  'EVENT_CANCELLED'
);

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "notificationPreferences" JSONB;

-- CreateTable
CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "entityType" TEXT,
  "entityId" TEXT,
  "metadata" JSONB,
  "isRead" BOOLEAN NOT NULL DEFAULT false,
  "readAt" TIMESTAMPTZ(3),
  "dedupeKey" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Notification_workspaceId_userId_dedupeKey_key"
  ON "Notification"("workspaceId", "userId", "dedupeKey");
CREATE INDEX "Notification_workspaceId_userId_createdAt_idx"
  ON "Notification"("workspaceId", "userId", "createdAt");
CREATE INDEX "Notification_workspaceId_userId_isRead_createdAt_idx"
  ON "Notification"("workspaceId", "userId", "isRead", "createdAt");

ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification"
  ADD CONSTRAINT "Notification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
