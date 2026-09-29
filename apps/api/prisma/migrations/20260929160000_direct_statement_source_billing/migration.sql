-- Work sources link directly to their statement. Statement lines no longer
-- exist independently of a statement.
ALTER TABLE "public"."Event" ADD COLUMN "statementId" TEXT;
ALTER TABLE "public"."Task" ADD COLUMN "statementId" TEXT;
ALTER TABLE "public"."Deadline" ADD COLUMN "statementId" TEXT;

UPDATE "public"."Event" source
SET "statementId" = line."statementId"
FROM "public"."BillingStatementLine" line
WHERE source."billingStatementLineId" = line."id"
  AND line."statementId" IS NOT NULL;

UPDATE "public"."Task" source
SET "statementId" = line."statementId"
FROM "public"."BillingStatementLine" line
WHERE source."billingStatementLineId" = line."id"
  AND line."statementId" IS NOT NULL;

UPDATE "public"."Deadline" source
SET "statementId" = line."statementId"
FROM "public"."BillingStatementLine" line
WHERE source."billingStatementLineId" = line."id"
  AND line."statementId" IS NOT NULL;

ALTER TABLE "public"."Event"
  DROP CONSTRAINT "Event_billingStatementLineId_fkey";
ALTER TABLE "public"."Task"
  DROP CONSTRAINT "Task_billingStatementLineId_fkey";
ALTER TABLE "public"."Deadline"
  DROP CONSTRAINT "Deadline_billingStatementLineId_fkey";

DROP INDEX "public"."Event_billingStatementLineId_key";
DROP INDEX "public"."Task_billingStatementLineId_key";
DROP INDEX "public"."Deadline_billingStatementLineId_key";

ALTER TABLE "public"."Event" DROP COLUMN "billingStatementLineId";
ALTER TABLE "public"."Task" DROP COLUMN "billingStatementLineId";
ALTER TABLE "public"."Deadline" DROP COLUMN "billingStatementLineId";

CREATE INDEX "Event_workspaceId_statementId_idx"
  ON "public"."Event"("workspaceId", "statementId");
CREATE INDEX "Task_workspaceId_statementId_idx"
  ON "public"."Task"("workspaceId", "statementId");
CREATE INDEX "Deadline_workspaceId_statementId_idx"
  ON "public"."Deadline"("workspaceId", "statementId");

ALTER TABLE "public"."Event"
  ADD CONSTRAINT "Event_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Task"
  ADD CONSTRAINT "Task_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."Deadline"
  ADD CONSTRAINT "Deadline_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Unattached lines represented the removed intermediate workflow and are not
-- retained. Attached historical lines remain children of their statements.
DELETE FROM "public"."BillingStatementLine"
WHERE "statementId" IS NULL;

UPDATE "public"."BillingStatementLine"
SET "status" = 'RESERVED'::"public"."BillingStatementLineStatus"
WHERE "statementId" IS NOT NULL
  AND "status" = 'UNBILLED'::"public"."BillingStatementLineStatus";

ALTER TABLE "public"."BillingStatementLine"
  DROP CONSTRAINT "BillingStatementLine_statementId_fkey";
ALTER TABLE "public"."BillingStatementLine"
  ALTER COLUMN "statementId" SET NOT NULL,
  ALTER COLUMN "status" SET DEFAULT 'RESERVED';
ALTER TABLE "public"."BillingStatementLine"
  ADD CONSTRAINT "BillingStatementLine_statementId_fkey"
    FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "public"."BillingSuggestionReview";
DROP TYPE "public"."BillingSuggestionResolution";
