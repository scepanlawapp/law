-- Drop the retired standalone notes feature and all of its stored rows.
DELETE FROM "public"."ActivityLog" WHERE "entityType" = 'Note';
DROP TABLE "public"."Note";
DROP TYPE "public"."NoteType";

-- Drop retired external payment tracking and any idempotency records that
-- pointed at payment rows before narrowing the operation enum.
DROP TABLE "public"."ExternalPaymentRecord";
DELETE FROM "public"."FinanceMutationRequest"
WHERE "operation" = 'CREATE_PAYMENT';

ALTER TYPE "public"."FinanceMutationOperation" RENAME TO "FinanceMutationOperation_old";
CREATE TYPE "public"."FinanceMutationOperation" AS ENUM ('CREATE_STATEMENT', 'SEND_STATEMENT');
ALTER TABLE "public"."FinanceMutationRequest"
ALTER COLUMN "operation" TYPE "public"."FinanceMutationOperation"
USING ("operation"::text::"public"."FinanceMutationOperation");
DROP TYPE "public"."FinanceMutationOperation_old";
