-- CreateEnum
CREATE TYPE "AssistantPermissionMode" AS ENUM ('MANUAL', 'ASK', 'AUTO');

-- CreateEnum
CREATE TYPE "PendingActionMode" AS ENUM ('FORM', 'CARD', 'AUTO');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN "assistantPermissionMode" "AssistantPermissionMode" NOT NULL DEFAULT 'ASK';

-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "permissionMode" "AssistantPermissionMode";

-- AlterTable
ALTER TABLE "PendingAction" ADD COLUMN "mode" "PendingActionMode" NOT NULL DEFAULT 'CARD';
