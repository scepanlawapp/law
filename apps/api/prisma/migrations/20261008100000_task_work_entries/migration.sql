ALTER TABLE "WorkEntry" ADD COLUMN "taskId" TEXT;
UPDATE "WorkEntry" AS entry SET "taskId" = task.id
FROM "Task" AS task
WHERE entry."sourceType" = 'TASK' AND entry."sourceId" = task.id
  AND entry."workspaceId" = task."workspaceId";
CREATE INDEX "WorkEntry_workspaceId_taskId_workDate_idx" ON "WorkEntry"("workspaceId", "taskId", "workDate");
ALTER TABLE "WorkEntry" ADD CONSTRAINT "WorkEntry_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE SET NULL ON UPDATE CASCADE;
