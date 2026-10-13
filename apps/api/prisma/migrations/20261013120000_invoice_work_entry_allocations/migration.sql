-- AlterTable
ALTER TABLE "public"."InvoiceLine" ADD COLUMN     "additionalAmount" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "public"."InvoiceWorkEntryAllocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "invoiceLineId" TEXT NOT NULL,
    "workEntryId" TEXT NOT NULL,
    "originalValue" DECIMAL(18,2),
    "originalCurrency" TEXT,
    "invoiceValue" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,

    CONSTRAINT "InvoiceWorkEntryAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InvoiceWorkEntryAllocation_workspaceId_workEntryId_idx" ON "public"."InvoiceWorkEntryAllocation"("workspaceId", "workEntryId");

-- CreateIndex
CREATE UNIQUE INDEX "InvoiceWorkEntryAllocation_invoiceLineId_workEntryId_key" ON "public"."InvoiceWorkEntryAllocation"("invoiceLineId", "workEntryId");

-- AddForeignKey
ALTER TABLE "public"."InvoiceWorkEntryAllocation" ADD CONSTRAINT "InvoiceWorkEntryAllocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWorkEntryAllocation" ADD CONSTRAINT "InvoiceWorkEntryAllocation_invoiceLineId_fkey" FOREIGN KEY ("invoiceLineId") REFERENCES "public"."InvoiceLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."InvoiceWorkEntryAllocation" ADD CONSTRAINT "InvoiceWorkEntryAllocation_workEntryId_fkey" FOREIGN KEY ("workEntryId") REFERENCES "public"."WorkEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
