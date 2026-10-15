-- An automatic assistant save the conversation owner undid.
ALTER TABLE "PendingAction" ADD COLUMN "undoneAt" TIMESTAMPTZ(3);
ALTER TABLE "PendingAction" ADD COLUMN "undoneByUserId" TEXT;
