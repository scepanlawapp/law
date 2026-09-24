-- CreateEnum
CREATE TYPE "public"."BillingEntryKind" AS ENUM ('TIME', 'FIXED_FEE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "public"."BillingDisposition" AS ENUM ('BILLABLE', 'INCLUDED', 'NO_CHARGE', 'INTERNAL');

-- CreateEnum
CREATE TYPE "public"."BillingEntryLifecycle" AS ENUM ('DRAFT', 'READY', 'RESERVED', 'STATEMENT_SENT', 'VOIDED');

-- CreateEnum
CREATE TYPE "public"."BillingSuggestionResolution" AS ENUM ('PENDING', 'RECORDED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."PriceSourceScope" AS ENUM ('CLIENT_AGREEMENT', 'WORKSPACE_PUBLIC_REFERENCE', 'CASE_OVERRIDE');

-- CreateEnum
CREATE TYPE "public"."BillingStatementStatus" AS ENUM ('DRAFT', 'SENT', 'VOIDED');

-- CreateEnum
CREATE TYPE "public"."FinanceMutationOperation" AS ENUM ('CREATE_STATEMENT', 'SEND_STATEMENT', 'CREATE_PAYMENT');

-- CreateTable
CREATE TABLE "public"."BillingEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "caseId" TEXT,
    "performedByUserId" TEXT NOT NULL,
    "workDate" DATE NOT NULL,
    "kind" "public"."BillingEntryKind" NOT NULL,
    "disposition" "public"."BillingDisposition" NOT NULL DEFAULT 'BILLABLE',
    "lifecycle" "public"."BillingEntryLifecycle" NOT NULL DEFAULT 'DRAFT',
    "description" TEXT NOT NULL,
    "clientDescription" TEXT NOT NULL,
    "durationMinutes" INTEGER,
    "billedDurationMinutes" INTEGER,
    "quantity" DECIMAL(18,4),
    "unit" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RSD',
    "noChargeReason" TEXT,
    "priceSourceVersionId" TEXT,
    "priceSourceExcerpt" TEXT,
    "sourceType" TEXT,
    "sourceId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingSuggestionReview" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "candidateKey" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "proposedPerformerId" TEXT,
    "resolution" "public"."BillingSuggestionResolution" NOT NULL DEFAULT 'PENDING',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "billingEntryId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingSuggestionReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "scope" "public"."PriceSourceScope" NOT NULL,
    "clientId" TEXT,
    "caseId" TEXT,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "documentId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PriceSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PriceSourceVersion" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "priceSourceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "rawText" TEXT NOT NULL,
    "effectiveFrom" DATE,
    "effectiveTo" DATE,
    "publishedAt" DATE,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceSourceVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingStatement" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "statementNumber" TEXT NOT NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "public"."BillingStatementStatus" NOT NULL DEFAULT 'DRAFT',
    "sharedAt" TIMESTAMPTZ(3),
    "sharedMethod" TEXT,
    "externalInvoiceNumber" TEXT,
    "externalInvoiceDate" DATE,
    "externalReference" TEXT,
    "voidedAt" TIMESTAMPTZ(3),
    "voidReason" TEXT,
    "sharedByUserId" TEXT,
    "voidedByUserId" TEXT,
    "replacementForId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "BillingStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BillingStatementLine" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "billingEntryId" TEXT NOT NULL,
    "lineOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "serviceDate" DATE NOT NULL,
    "caseReference" TEXT,
    "quantity" DECIMAL(18,4),
    "durationMinutes" INTEGER,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "chargeLabel" "public"."BillingDisposition" NOT NULL,

    CONSTRAINT "BillingStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalPaymentRecord" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "paidDate" DATE NOT NULL,
    "externalReference" TEXT,
    "reversedAt" TIMESTAMPTZ(3),
    "reversalReason" TEXT,
    "recordedByUserId" TEXT NOT NULL,
    "reversedByUserId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalPaymentRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FinanceMutationRequest" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "operation" "public"."FinanceMutationOperation" NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "resultEntityId" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinanceMutationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BillingEntry_workspaceId_clientId_workDate_lifecycle_idx" ON "public"."BillingEntry"("workspaceId", "clientId", "workDate", "lifecycle");

-- CreateIndex
CREATE INDEX "BillingEntry_workspaceId_caseId_workDate_idx" ON "public"."BillingEntry"("workspaceId", "caseId", "workDate");

-- CreateIndex
CREATE INDEX "BillingEntry_workspaceId_performedByUserId_workDate_idx" ON "public"."BillingEntry"("workspaceId", "performedByUserId", "workDate");

-- CreateIndex
CREATE INDEX "BillingEntry_workspaceId_disposition_lifecycle_idx" ON "public"."BillingEntry"("workspaceId", "disposition", "lifecycle");

-- CreateIndex
CREATE INDEX "BillingEntry_sourceType_sourceId_idx" ON "public"."BillingEntry"("sourceType", "sourceId");

-- CreateIndex
CREATE INDEX "BillingSuggestionReview_workspaceId_resolution_updatedAt_idx" ON "public"."BillingSuggestionReview"("workspaceId", "resolution", "updatedAt");

-- CreateIndex
CREATE INDEX "BillingSuggestionReview_workspaceId_sourceType_sourceId_idx" ON "public"."BillingSuggestionReview"("workspaceId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingSuggestionReview_workspaceId_candidateKey_key" ON "public"."BillingSuggestionReview"("workspaceId", "candidateKey");

-- CreateIndex
CREATE INDEX "PriceSource_workspaceId_scope_clientId_caseId_idx" ON "public"."PriceSource"("workspaceId", "scope", "clientId", "caseId");

-- CreateIndex
CREATE INDEX "PriceSource_workspaceId_updatedAt_idx" ON "public"."PriceSource"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "PriceSourceVersion_workspaceId_priceSourceId_createdAt_idx" ON "public"."PriceSourceVersion"("workspaceId", "priceSourceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PriceSourceVersion_priceSourceId_version_key" ON "public"."PriceSourceVersion"("priceSourceId", "version");

-- CreateIndex
CREATE INDEX "BillingStatement_workspaceId_clientId_status_periodEnd_idx" ON "public"."BillingStatement"("workspaceId", "clientId", "status", "periodEnd");

-- CreateIndex
CREATE INDEX "BillingStatement_workspaceId_status_periodEnd_idx" ON "public"."BillingStatement"("workspaceId", "status", "periodEnd");

-- CreateIndex
CREATE UNIQUE INDEX "BillingStatement_workspaceId_statementNumber_key" ON "public"."BillingStatement"("workspaceId", "statementNumber");

-- CreateIndex
CREATE INDEX "BillingStatementLine_billingEntryId_idx" ON "public"."BillingStatementLine"("billingEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingStatementLine_statementId_lineOrder_key" ON "public"."BillingStatementLine"("statementId", "lineOrder");

-- CreateIndex
CREATE INDEX "ExternalPaymentRecord_workspaceId_statementId_paidDate_idx" ON "public"."ExternalPaymentRecord"("workspaceId", "statementId", "paidDate");

-- CreateIndex
CREATE INDEX "FinanceMutationRequest_workspaceId_createdAt_idx" ON "public"."FinanceMutationRequest"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FinanceMutationRequest_workspaceId_operation_idempotencyKey_key" ON "public"."FinanceMutationRequest"("workspaceId", "operation", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingEntry" ADD CONSTRAINT "BillingEntry_priceSourceVersionId_fkey" FOREIGN KEY ("priceSourceVersionId") REFERENCES "public"."PriceSourceVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSuggestionReview" ADD CONSTRAINT "BillingSuggestionReview_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSuggestionReview" ADD CONSTRAINT "BillingSuggestionReview_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingSuggestionReview" ADD CONSTRAINT "BillingSuggestionReview_billingEntryId_fkey" FOREIGN KEY ("billingEntryId") REFERENCES "public"."BillingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSource" ADD CONSTRAINT "PriceSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSource" ADD CONSTRAINT "PriceSource_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSource" ADD CONSTRAINT "PriceSource_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSource" ADD CONSTRAINT "PriceSource_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSourceVersion" ADD CONSTRAINT "PriceSourceVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSourceVersion" ADD CONSTRAINT "PriceSourceVersion_priceSourceId_fkey" FOREIGN KEY ("priceSourceId") REFERENCES "public"."PriceSource"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PriceSourceVersion" ADD CONSTRAINT "PriceSourceVersion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_sharedByUserId_fkey" FOREIGN KEY ("sharedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatement" ADD CONSTRAINT "BillingStatement_replacementForId_fkey" FOREIGN KEY ("replacementForId") REFERENCES "public"."BillingStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatementLine" ADD CONSTRAINT "BillingStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BillingStatementLine" ADD CONSTRAINT "BillingStatementLine_billingEntryId_fkey" FOREIGN KEY ("billingEntryId") REFERENCES "public"."BillingEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalPaymentRecord" ADD CONSTRAINT "ExternalPaymentRecord_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalPaymentRecord" ADD CONSTRAINT "ExternalPaymentRecord_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "public"."BillingStatement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalPaymentRecord" ADD CONSTRAINT "ExternalPaymentRecord_recordedByUserId_fkey" FOREIGN KEY ("recordedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ExternalPaymentRecord" ADD CONSTRAINT "ExternalPaymentRecord_reversedByUserId_fkey" FOREIGN KEY ("reversedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FinanceMutationRequest" ADD CONSTRAINT "FinanceMutationRequest_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
