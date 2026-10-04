ALTER TYPE "public"."BillingStatementStatus" RENAME TO "InvoiceStatus";
ALTER TYPE "public"."BillingStatementLineStatus" RENAME TO "InvoiceLineStatus";
ALTER TYPE "public"."FinanceMutationOperation" RENAME VALUE 'CREATE_STATEMENT' TO 'CREATE_INVOICE';
ALTER TYPE "public"."FinanceMutationOperation" RENAME VALUE 'SEND_STATEMENT' TO 'SEND_INVOICE';

ALTER TABLE "public"."BillingStatement" RENAME TO "Invoice";
ALTER TABLE "public"."BillingStatementLine" RENAME TO "InvoiceLine";
ALTER TABLE "public"."BillingStatementLineCase" RENAME TO "InvoiceLineCase";

ALTER TABLE "public"."Invoice" RENAME COLUMN "statementNumber" TO "invoiceNumber";
ALTER TABLE "public"."InvoiceLine" RENAME COLUMN "statementId" TO "invoiceId";
ALTER TABLE "public"."InvoiceLineCase" RENAME COLUMN "billingStatementLineId" TO "invoiceLineId";
ALTER TABLE "public"."Event" RENAME COLUMN "statementId" TO "invoiceId";
ALTER TABLE "public"."Task" RENAME COLUMN "statementId" TO "invoiceId";
ALTER TABLE "public"."Deadline" RENAME COLUMN "statementId" TO "invoiceId";

ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_pkey" TO "Invoice_pkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_workspaceId_fkey" TO "Invoice_workspaceId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_clientId_fkey" TO "Invoice_clientId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_sharedByUserId_fkey" TO "Invoice_sharedByUserId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_voidedByUserId_fkey" TO "Invoice_voidedByUserId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_createdByUserId_fkey" TO "Invoice_createdByUserId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_updatedByUserId_fkey" TO "Invoice_updatedByUserId_fkey";
ALTER TABLE "public"."Invoice" RENAME CONSTRAINT "BillingStatement_replacementForId_fkey" TO "Invoice_replacementForId_fkey";

ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_pkey" TO "InvoiceLine_pkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_workspaceId_fkey" TO "InvoiceLine_workspaceId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_statementId_fkey" TO "InvoiceLine_invoiceId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_clientId_fkey" TO "InvoiceLine_clientId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_performedByUserId_fkey" TO "InvoiceLine_performedByUserId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_cancelledByUserId_fkey" TO "InvoiceLine_cancelledByUserId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_createdByUserId_fkey" TO "InvoiceLine_createdByUserId_fkey";
ALTER TABLE "public"."InvoiceLine" RENAME CONSTRAINT "BillingStatementLine_updatedByUserId_fkey" TO "InvoiceLine_updatedByUserId_fkey";

ALTER TABLE "public"."InvoiceLineCase" RENAME CONSTRAINT "BillingStatementLineCase_pkey" TO "InvoiceLineCase_pkey";
ALTER TABLE "public"."InvoiceLineCase" RENAME CONSTRAINT "BillingStatementLineCase_workspaceId_fkey" TO "InvoiceLineCase_workspaceId_fkey";
ALTER TABLE "public"."InvoiceLineCase" RENAME CONSTRAINT "BillingStatementLineCase_billingStatementLineId_fkey" TO "InvoiceLineCase_invoiceLineId_fkey";
ALTER TABLE "public"."InvoiceLineCase" RENAME CONSTRAINT "BillingStatementLineCase_caseId_fkey" TO "InvoiceLineCase_caseId_fkey";

ALTER TABLE "public"."Event" RENAME CONSTRAINT "Event_statementId_fkey" TO "Event_invoiceId_fkey";
ALTER TABLE "public"."Task" RENAME CONSTRAINT "Task_statementId_fkey" TO "Task_invoiceId_fkey";
ALTER TABLE "public"."Deadline" RENAME CONSTRAINT "Deadline_statementId_fkey" TO "Deadline_invoiceId_fkey";

ALTER INDEX "public"."BillingStatement_workspaceId_statementNumber_key" RENAME TO "Invoice_workspaceId_invoiceNumber_key";
ALTER INDEX "public"."BillingStatement_workspaceId_clientId_status_dateOfMaturity_idx" RENAME TO "Invoice_workspaceId_clientId_status_dateOfMaturity_idx";
ALTER INDEX "public"."BillingStatement_workspaceId_status_dateOfMaturity_idx" RENAME TO "Invoice_workspaceId_status_dateOfMaturity_idx";
ALTER INDEX "public"."BillingStatementLine_statementId_lineOrder_key" RENAME TO "InvoiceLine_invoiceId_lineOrder_key";
ALTER INDEX "public"."BillingStatementLine_workspaceId_clientId_status_serviceDat_idx" RENAME TO "InvoiceLine_workspaceId_clientId_status_serviceDate_idx";
ALTER INDEX "public"."BillingStatementLine_workspaceId_performedByUserId_serviceD_idx" RENAME TO "InvoiceLine_workspaceId_performedByUserId_serviceDate_idx";
ALTER INDEX "public"."BillingStatementLine_sourceType_sourceId_idx" RENAME TO "InvoiceLine_sourceType_sourceId_idx";
ALTER INDEX "public"."BillingStatementLineCase_workspaceId_caseId_idx" RENAME TO "InvoiceLineCase_workspaceId_caseId_idx";
ALTER INDEX "public"."BillingStatementLineCase_caseId_idx" RENAME TO "InvoiceLineCase_caseId_idx";
ALTER INDEX "public"."Event_workspaceId_statementId_idx" RENAME TO "Event_workspaceId_invoiceId_idx";
ALTER INDEX "public"."Task_workspaceId_statementId_idx" RENAME TO "Task_workspaceId_invoiceId_idx";
ALTER INDEX "public"."Deadline_workspaceId_statementId_idx" RENAME TO "Deadline_workspaceId_invoiceId_idx";

