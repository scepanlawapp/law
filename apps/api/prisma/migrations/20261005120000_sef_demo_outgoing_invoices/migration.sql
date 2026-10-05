CREATE TYPE "SefSubmissionState" AS ENUM ('PREPARED', 'SENDING', 'SUBMITTED', 'FAILED', 'UNKNOWN');

ALTER TABLE "Invoice"
ADD COLUMN "vatLiabilityTimingCode" TEXT;

ALTER TABLE "InvoiceLine"
ADD COLUMN "taxCategoryCode" TEXT,
ADD COLUMN "taxExemptionReasonCode" TEXT,
ADD COLUMN "taxExemptionReasonText" TEXT;

ALTER TABLE "Client"
ADD COLUMN "isPublicSector" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "jbkjs" TEXT;

CREATE TABLE "InvoiceSefSubmission" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "environment" "SefEnvironment" NOT NULL,
    "revision" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "supplierTaxId" TEXT NOT NULL,
    "state" "SefSubmissionState" NOT NULL DEFAULT 'PREPARED',
    "sefInvoiceId" TEXT,
    "sefSalesInvoiceId" TEXT,
    "sefPurchaseInvoiceId" TEXT,
    "remoteStatus" TEXT,
    "ublXml" TEXT NOT NULL,
    "payloadSha256" TEXT NOT NULL,
    "sourceSnapshot" JSONB NOT NULL,
    "validationResult" JSONB NOT NULL,
    "apiResponse" JSONB,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "httpStatus" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "submittedByUserId" TEXT NOT NULL,
    "submittedAt" TIMESTAMPTZ(3),
    "sendingStartedAt" TIMESTAMPTZ(3),
    "lastCheckedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "InvoiceSefSubmission_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvoiceSefSubmission_workspaceId_environment_requestId_key"
ON "InvoiceSefSubmission"("workspaceId", "environment", "requestId");
CREATE UNIQUE INDEX "InvoiceSefSubmission_workspaceId_environment_idempotencyKey_key"
ON "InvoiceSefSubmission"("workspaceId", "environment", "idempotencyKey");
CREATE UNIQUE INDEX "InvoiceSefSubmission_invoiceId_environment_revision_key"
ON "InvoiceSefSubmission"("invoiceId", "environment", "revision");
CREATE INDEX "InvoiceSefSubmission_workspaceId_invoiceId_environment_createdAt_idx"
ON "InvoiceSefSubmission"("workspaceId", "invoiceId", "environment", "createdAt");
CREATE INDEX "InvoiceSefSubmission_workspaceId_state_updatedAt_idx"
ON "InvoiceSefSubmission"("workspaceId", "state", "updatedAt");

ALTER TABLE "InvoiceSefSubmission" ADD CONSTRAINT "InvoiceSefSubmission_invoiceId_fkey"
FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSefSubmission" ADD CONSTRAINT "InvoiceSefSubmission_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "InvoiceSefSubmission" ADD CONSTRAINT "InvoiceSefSubmission_submittedByUserId_fkey"
FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "public"."InvoiceSefSubmission_workspaceId_invoiceId_environment_createdA" RENAME TO "InvoiceSefSubmission_workspaceId_invoiceId_environment_crea_idx";

