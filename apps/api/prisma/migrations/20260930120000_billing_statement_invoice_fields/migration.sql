ALTER TABLE "public"."BillingStatement"
  RENAME COLUMN "periodStart" TO "dateOfCreate";

ALTER TABLE "public"."BillingStatement"
  RENAME COLUMN "periodEnd" TO "dateOfMaturity";

ALTER TABLE "public"."BillingStatementLine"
  RENAME COLUMN "amount" TO "netAmount";

ALTER TABLE "public"."BillingStatement"
  ADD COLUMN "dateOfTurnover" DATE,
  ADD COLUMN "placeOfIssue" TEXT,
  ADD COLUMN "methodOfPayment" TEXT,
  ADD COLUMN "comment" TEXT,
  ADD COLUMN "netAmount" DECIMAL(18,2),
  ADD COLUMN "vatRate" DECIMAL(5,2),
  ADD COLUMN "vatAmount" DECIMAL(18,2),
  ADD COLUMN "grossAmount" DECIMAL(18,2),
  ADD COLUMN "numberOfCashBill" TEXT,
  ADD COLUMN "country" TEXT;

ALTER TABLE "public"."BillingStatementLine"
  ADD COLUMN "vatRate" DECIMAL(5,2),
  ADD COLUMN "vatAmount" DECIMAL(18,2),
  ADD COLUMN "grossAmount" DECIMAL(18,2);

UPDATE "public"."BillingStatementLine"
SET
  "vatRate" = 0,
  "vatAmount" = 0,
  "grossAmount" = "netAmount";

UPDATE "public"."BillingStatement" statement
SET
  "dateOfTurnover" = statement."dateOfCreate",
  "placeOfIssue" = '',
  "methodOfPayment" = '',
  "comment" = '',
  "netAmount" = totals."netAmount",
  "vatRate" = 0,
  "vatAmount" = totals."vatAmount",
  "grossAmount" = totals."grossAmount",
  "numberOfCashBill" = '',
  "country" = ''
FROM (
  SELECT
    statement_row."id",
    COALESCE(SUM(line."netAmount"), 0)::DECIMAL(18,2) AS "netAmount",
    COALESCE(SUM(line."vatAmount"), 0)::DECIMAL(18,2) AS "vatAmount",
    COALESCE(SUM(line."grossAmount"), 0)::DECIMAL(18,2) AS "grossAmount"
  FROM "public"."BillingStatement" statement_row
  LEFT JOIN "public"."BillingStatementLine" line
    ON line."statementId" = statement_row."id"
  GROUP BY statement_row."id"
) totals
WHERE statement."id" = totals."id";

ALTER TABLE "public"."BillingStatement"
  ALTER COLUMN "dateOfTurnover" SET NOT NULL,
  ALTER COLUMN "placeOfIssue" SET NOT NULL,
  ALTER COLUMN "methodOfPayment" SET NOT NULL,
  ALTER COLUMN "comment" SET NOT NULL,
  ALTER COLUMN "netAmount" SET NOT NULL,
  ALTER COLUMN "vatRate" SET NOT NULL,
  ALTER COLUMN "vatAmount" SET NOT NULL,
  ALTER COLUMN "grossAmount" SET NOT NULL,
  ALTER COLUMN "numberOfCashBill" SET NOT NULL,
  ALTER COLUMN "country" SET NOT NULL;

ALTER TABLE "public"."BillingStatementLine"
  ALTER COLUMN "vatRate" SET NOT NULL,
  ALTER COLUMN "vatAmount" SET NOT NULL,
  ALTER COLUMN "grossAmount" SET NOT NULL;

ALTER INDEX "public"."BillingStatement_workspaceId_clientId_status_periodEnd_idx"
  RENAME TO "BillingStatement_workspaceId_clientId_status_dateOfMaturity_idx";

ALTER INDEX "public"."BillingStatement_workspaceId_status_periodEnd_idx"
  RENAME TO "BillingStatement_workspaceId_status_dateOfMaturity_idx";
