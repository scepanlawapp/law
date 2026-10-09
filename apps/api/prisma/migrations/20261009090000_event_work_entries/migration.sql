ALTER TABLE "WorkEntry" ADD COLUMN "eventId" TEXT;
UPDATE "WorkEntry" AS w SET "eventId" = e."id"
FROM "Event" AS e WHERE w."sourceType" = 'EVENT' AND w."sourceId" = e."id" AND w."workspaceId" = e."workspaceId";
CREATE INDEX "WorkEntry_workspaceId_eventId_workDate_idx" ON "WorkEntry"("workspaceId", "eventId", "workDate");
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
