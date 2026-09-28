-- Preserve existing billing dates as one-day periods.
ALTER TABLE "public"."BillingEntry" RENAME COLUMN "workDate" TO "workStartDate";
ALTER TABLE "public"."BillingEntry" ADD COLUMN "workEndDate" DATE;
UPDATE "public"."BillingEntry" SET "workEndDate" = "workStartDate";
ALTER TABLE "public"."BillingEntry" ALTER COLUMN "workEndDate" SET NOT NULL;

-- Snapshot the end of the service period on statement lines as well.
ALTER TABLE "public"."BillingStatementLine" ADD COLUMN "serviceEndDate" DATE;
UPDATE "public"."BillingStatementLine" SET "serviceEndDate" = "serviceDate";
ALTER TABLE "public"."BillingStatementLine" ALTER COLUMN "serviceEndDate" SET NOT NULL;

-- Replace the single optional case with an explicit workspace-scoped join.
CREATE TABLE "public"."BillingEntryCase" (
    "workspaceId" TEXT NOT NULL,
    "billingEntryId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,

    CONSTRAINT "BillingEntryCase_pkey" PRIMARY KEY ("billingEntryId", "caseId")
);

INSERT INTO "public"."BillingEntryCase" ("workspaceId", "billingEntryId", "caseId")
SELECT "workspaceId", "id", "caseId"
FROM "public"."BillingEntry"
WHERE "caseId" IS NOT NULL;

DROP INDEX "public"."BillingEntry_workspaceId_clientId_workDate_lifecycle_idx";
DROP INDEX "public"."BillingEntry_workspaceId_caseId_workDate_idx";
DROP INDEX "public"."BillingEntry_workspaceId_performedByUserId_workDate_idx";
ALTER TABLE "public"."BillingEntry" DROP CONSTRAINT "BillingEntry_caseId_fkey";
ALTER TABLE "public"."BillingEntry" DROP COLUMN "caseId";

CREATE INDEX "BillingEntry_workspaceId_clientId_workStartDate_lifecycle_idx"
ON "public"."BillingEntry"("workspaceId", "clientId", "workStartDate", "lifecycle");
CREATE INDEX "BillingEntry_workspaceId_performedByUserId_workStartDate_idx"
ON "public"."BillingEntry"("workspaceId", "performedByUserId", "workStartDate");
CREATE INDEX "BillingEntryCase_workspaceId_caseId_idx"
ON "public"."BillingEntryCase"("workspaceId", "caseId");
CREATE INDEX "BillingEntryCase_caseId_idx"
ON "public"."BillingEntryCase"("caseId");

ALTER TABLE "public"."BillingEntryCase"
ADD CONSTRAINT "BillingEntryCase_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."BillingEntryCase"
ADD CONSTRAINT "BillingEntryCase_billingEntryId_fkey"
FOREIGN KEY ("billingEntryId") REFERENCES "public"."BillingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "public"."BillingEntryCase"
ADD CONSTRAINT "BillingEntryCase_caseId_fkey"
FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
