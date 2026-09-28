-- Statement lines are now the primary recorded-work object and can exist
-- before they are attached to a billing statement.
CREATE TYPE "public"."BillingStatementLineStatus" AS ENUM (
  'UNBILLED',
  'RESERVED',
  'BILLED',
  'CANCELLED'
);

ALTER TABLE "public"."BillingStatementLine"
  DROP CONSTRAINT "BillingStatementLine_statementId_fkey",
  DROP CONSTRAINT "BillingStatementLine_billingEntryId_fkey";

DROP INDEX "public"."BillingStatementLine_billingEntryId_idx";
DROP INDEX "public"."BillingStatementLine_statementId_lineOrder_key";

ALTER TABLE "public"."BillingStatementLine"
  ALTER COLUMN "statementId" DROP NOT NULL,
  ALTER COLUMN "lineOrder" DROP NOT NULL,
  ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN "clientId" TEXT,
  ADD COLUMN "performedByUserId" TEXT,
  ADD COLUMN "status" "public"."BillingStatementLineStatus",
  ADD COLUMN "sourceType" TEXT,
  ADD COLUMN "sourceId" TEXT,
  ADD COLUMN "billedAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancelledAt" TIMESTAMPTZ(3),
  ADD COLUMN "cancellationReason" TEXT,
  ADD COLUMN "cancelledByUserId" TEXT,
  ADD COLUMN "createdByUserId" TEXT,
  ADD COLUMN "updatedByUserId" TEXT,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3),
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3);

UPDATE "public"."BillingStatementLine" line
SET
  "workspaceId" = entry."workspaceId",
  "clientId" = entry."clientId",
  "performedByUserId" = entry."performedByUserId",
  "status" = CASE entry."lifecycle"::text
    WHEN 'STATEMENT_SENT' THEN 'BILLED'::"public"."BillingStatementLineStatus"
    WHEN 'RESERVED' THEN 'RESERVED'::"public"."BillingStatementLineStatus"
    WHEN 'VOIDED' THEN 'CANCELLED'::"public"."BillingStatementLineStatus"
    ELSE 'UNBILLED'::"public"."BillingStatementLineStatus"
  END,
  "sourceType" = entry."sourceType",
  "sourceId" = entry."sourceId",
  "billedAt" = CASE
    WHEN entry."lifecycle"::text = 'STATEMENT_SENT' THEN (
      SELECT statement."sharedAt"
      FROM "public"."BillingStatement" statement
      WHERE statement."id" = line."statementId"
    )
    ELSE NULL
  END,
  "cancelledAt" = CASE
    WHEN entry."lifecycle"::text = 'VOIDED' THEN entry."updatedAt"
    ELSE NULL
  END,
  "cancellationReason" = CASE
    WHEN entry."lifecycle"::text = 'VOIDED' THEN 'Migrated voided billing entry'
    ELSE NULL
  END,
  "createdByUserId" = entry."createdByUserId",
  "updatedByUserId" = entry."updatedByUserId",
  "createdAt" = entry."createdAt",
  "updatedAt" = entry."updatedAt"
FROM "public"."BillingEntry" entry
WHERE entry."id" = line."billingEntryId";

INSERT INTO "public"."BillingStatementLine" (
  "id",
  "billingEntryId",
  "workspaceId",
  "clientId",
  "performedByUserId",
  "description",
  "serviceDate",
  "serviceEndDate",
  "amount",
  "currency",
  "chargeLabel",
  "status",
  "sourceType",
  "sourceId",
  "cancelledAt",
  "cancellationReason",
  "createdByUserId",
  "updatedByUserId",
  "createdAt",
  "updatedAt"
)
SELECT
  'line-' || entry."id",
  entry."id",
  entry."workspaceId",
  entry."clientId",
  entry."performedByUserId",
  entry."clientDescription",
  entry."workStartDate",
  entry."workEndDate",
  entry."amount",
  entry."currency",
  entry."disposition",
  CASE entry."lifecycle"::text
    WHEN 'STATEMENT_SENT' THEN 'BILLED'::"public"."BillingStatementLineStatus"
    WHEN 'RESERVED' THEN 'RESERVED'::"public"."BillingStatementLineStatus"
    WHEN 'VOIDED' THEN 'CANCELLED'::"public"."BillingStatementLineStatus"
    ELSE 'UNBILLED'::"public"."BillingStatementLineStatus"
  END,
  entry."sourceType",
  entry."sourceId",
  CASE WHEN entry."lifecycle"::text = 'VOIDED' THEN entry."updatedAt" ELSE NULL END,
  CASE WHEN entry."lifecycle"::text = 'VOIDED' THEN 'Migrated voided billing entry' ELSE NULL END,
  entry."createdByUserId",
  entry."updatedByUserId",
  entry."createdAt",
  entry."updatedAt"
FROM "public"."BillingEntry" entry
WHERE NOT EXISTS (
  SELECT 1
  FROM "public"."BillingStatementLine" line
  WHERE line."billingEntryId" = entry."id"
);

CREATE TABLE "public"."BillingStatementLineCase" (
  "workspaceId" TEXT NOT NULL,
  "billingStatementLineId" TEXT NOT NULL,
  "caseId" TEXT NOT NULL,
  CONSTRAINT "BillingStatementLineCase_pkey"
    PRIMARY KEY ("billingStatementLineId", "caseId")
);

INSERT INTO "public"."BillingStatementLineCase" (
  "workspaceId",
  "billingStatementLineId",
  "caseId"
)
SELECT
  entry_case."workspaceId",
  COALESCE(existing_line."id", 'line-' || entry_case."billingEntryId"),
  entry_case."caseId"
FROM "public"."BillingEntryCase" entry_case
LEFT JOIN LATERAL (
  SELECT line."id"
  FROM "public"."BillingStatementLine" line
  WHERE line."billingEntryId" = entry_case."billingEntryId"
  ORDER BY line."id"
  LIMIT 1
) existing_line ON TRUE;

ALTER TABLE "public"."BillingSuggestionReview"
  ADD COLUMN "billingStatementLineId" TEXT;

UPDATE "public"."BillingSuggestionReview" review
SET "billingStatementLineId" = COALESCE(
  (
    SELECT line."id"
    FROM "public"."BillingStatementLine" line
    WHERE line."billingEntryId" = review."billingEntryId"
    ORDER BY line."id"
    LIMIT 1
  ),
  'line-' || review."billingEntryId"
)
WHERE review."billingEntryId" IS NOT NULL;

ALTER TABLE "public"."Event" ADD COLUMN "billingStatementLineId" TEXT;
ALTER TABLE "public"."Task" ADD COLUMN "billingStatementLineId" TEXT;
ALTER TABLE "public"."Deadline" ADD COLUMN "billingStatementLineId" TEXT;

WITH sources AS (
  SELECT DISTINCT ON ("sourceType", "sourceId") "id", "sourceType", "sourceId"
  FROM "public"."BillingStatementLine"
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
  ORDER BY "sourceType", "sourceId", "createdAt"
)
UPDATE "public"."Event" source
SET "billingStatementLineId" = sources."id"
FROM sources
WHERE sources."sourceType" = 'EVENT' AND sources."sourceId" = source."id";

WITH sources AS (
  SELECT DISTINCT ON ("sourceType", "sourceId") "id", "sourceType", "sourceId"
  FROM "public"."BillingStatementLine"
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
  ORDER BY "sourceType", "sourceId", "createdAt"
)
UPDATE "public"."Task" source
SET "billingStatementLineId" = sources."id"
FROM sources
WHERE sources."sourceType" = 'TASK' AND sources."sourceId" = source."id";

WITH sources AS (
  SELECT DISTINCT ON ("sourceType", "sourceId") "id", "sourceType", "sourceId"
  FROM "public"."BillingStatementLine"
  WHERE "sourceType" IS NOT NULL AND "sourceId" IS NOT NULL
  ORDER BY "sourceType", "sourceId", "createdAt"
)
UPDATE "public"."Deadline" source
SET "billingStatementLineId" = sources."id"
FROM sources
WHERE sources."sourceType" = 'DEADLINE' AND sources."sourceId" = source."id";

ALTER TABLE "public"."BillingStatementLine"
  ALTER COLUMN "workspaceId" SET NOT NULL,
  ALTER COLUMN "clientId" SET NOT NULL,
  ALTER COLUMN "performedByUserId" SET NOT NULL,
  ALTER COLUMN "status" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'UNBILLED',
  ALTER COLUMN "createdByUserId" SET NOT NULL,
  ALTER COLUMN "updatedByUserId" SET NOT NULL,
  ALTER COLUMN "createdAt" SET NOT NULL,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET NOT NULL,
  DROP COLUMN "billingEntryId",
  DROP COLUMN "serviceEndDate",
  DROP COLUMN "caseReference",
  DROP COLUMN "quantity",
  DROP COLUMN "durationMinutes",
  DROP COLUMN "chargeLabel";

ALTER TABLE "public"."BillingSuggestionReview"
  DROP CONSTRAINT "BillingSuggestionReview_billingEntryId_fkey",
  DROP COLUMN "billingEntryId";

CREATE UNIQUE INDEX "BillingStatementLine_statementId_lineOrder_key"
  ON "public"."BillingStatementLine"("statementId", "lineOrder");
CREATE INDEX "BillingStatementLine_workspaceId_clientId_status_serviceDate_idx"
  ON "public"."BillingStatementLine"("workspaceId", "clientId", "status", "serviceDate");
CREATE INDEX "BillingStatementLine_workspaceId_performedByUserId_serviceDate_idx"
  ON "public"."BillingStatementLine"("workspaceId", "performedByUserId", "serviceDate");
CREATE INDEX "BillingStatementLine_sourceType_sourceId_idx"
  ON "public"."BillingStatementLine"("sourceType", "sourceId");
CREATE INDEX "BillingStatementLineCase_workspaceId_caseId_idx"
  ON "public"."BillingStatementLineCase"("workspaceId", "caseId");
CREATE INDEX "BillingStatementLineCase_caseId_idx"
  ON "public"."BillingStatementLineCase"("caseId");
CREATE UNIQUE INDEX "Event_billingStatementLineId_key"
  ON "public"."Event"("billingStatementLineId");
CREATE UNIQUE INDEX "Task_billingStatementLineId_key"
  ON "public"."Task"("billingStatementLineId");
CREATE UNIQUE INDEX "Deadline_billingStatementLineId_key"
  ON "public"."Deadline"("billingStatementLineId");

ALTER TABLE "public"."BillingStatementLine"
  ADD CONSTRAINT "BillingStatementLine_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_performedByUserId_fkey"
    FOREIGN KEY ("performedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_cancelledByUserId_fkey"
    FOREIGN KEY ("cancelledByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_createdByUserId_fkey"
    FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLine_updatedByUserId_fkey"
    FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."BillingStatementLineCase"
  ADD CONSTRAINT "BillingStatementLineCase_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLineCase_billingStatementLineId_fkey"
    FOREIGN KEY ("billingStatementLineId") REFERENCES "public"."BillingStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "BillingStatementLineCase_caseId_fkey"
    FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "public"."BillingSuggestionReview"
  ADD CONSTRAINT "BillingSuggestionReview_billingStatementLineId_fkey"
    FOREIGN KEY ("billingStatementLineId") REFERENCES "public"."BillingStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "public"."Event"
  ADD CONSTRAINT "Event_billingStatementLineId_fkey"
    FOREIGN KEY ("billingStatementLineId") REFERENCES "public"."BillingStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Task"
  ADD CONSTRAINT "Task_billingStatementLineId_fkey"
    FOREIGN KEY ("billingStatementLineId") REFERENCES "public"."BillingStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Deadline"
  ADD CONSTRAINT "Deadline_billingStatementLineId_fkey"
    FOREIGN KEY ("billingStatementLineId") REFERENCES "public"."BillingStatementLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP TABLE "public"."BillingEntryCase";
DROP TABLE "public"."BillingEntry";
DROP TYPE "public"."BillingEntryKind";
DROP TYPE "public"."BillingDisposition";
DROP TYPE "public"."BillingEntryLifecycle";
