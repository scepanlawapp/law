-- CreateEnum
CREATE TYPE "public"."PaymentStatus" AS ENUM ('ACTIVE', 'VOIDED');

-- CreateEnum
CREATE TYPE "public"."ReceiptMethod" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."PaymentPurpose" AS ENUM ('REGULAR', 'ADVANCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."FinanceMutationOperation" ADD VALUE 'CREATE_PAYMENT';
ALTER TYPE "public"."FinanceMutationOperation" ADD VALUE 'UPDATE_PAYMENT';
ALTER TYPE "public"."FinanceMutationOperation" ADD VALUE 'VOID_PAYMENT';

-- CreateTable
CREATE TABLE "public"."Payment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT,
    "amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "receivedAt" DATE NOT NULL,
    "paymentMethod" "public"."ReceiptMethod" NOT NULL,
    "purpose" "public"."PaymentPurpose" NOT NULL DEFAULT 'REGULAR',
    "status" "public"."PaymentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reference" TEXT,
    "payerName" TEXT,
    "note" TEXT,
    "bankAccountId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "voidedAt" TIMESTAMPTZ(3),
    "voidedByUserId" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentAllocation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amount" DECIMAL(18,2) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "removedAt" TIMESTAMPTZ(3),

    CONSTRAINT "PaymentAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PaymentAuditEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "performedByUserId" TEXT NOT NULL,
    "previousData" JSONB,
    "newData" JSONB NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Payment_workspaceId_status_receivedAt_idx" ON "public"."Payment"("workspaceId", "status", "receivedAt");

-- CreateIndex
CREATE INDEX "Payment_workspaceId_clientId_currency_idx" ON "public"."Payment"("workspaceId", "clientId", "currency");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_workspaceId_id_key" ON "public"."Payment"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "PaymentAllocation_workspaceId_paymentId_removedAt_idx" ON "public"."PaymentAllocation"("workspaceId", "paymentId", "removedAt");

-- CreateIndex
CREATE INDEX "PaymentAllocation_workspaceId_invoiceId_removedAt_idx" ON "public"."PaymentAllocation"("workspaceId", "invoiceId", "removedAt");

-- CreateIndex
CREATE INDEX "PaymentAuditEvent_workspaceId_paymentId_createdAt_idx" ON "public"."PaymentAuditEvent"("workspaceId", "paymentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankAccount_workspaceId_id_key" ON "public"."BankAccount"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Client_workspaceId_id_key" ON "public"."Client"("workspaceId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_workspaceId_id_key" ON "public"."Invoice"("workspaceId", "id");

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_workspaceId_clientId_fkey" FOREIGN KEY ("workspaceId", "clientId") REFERENCES "public"."Client"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_workspaceId_bankAccountId_fkey" FOREIGN KEY ("workspaceId", "bankAccountId") REFERENCES "public"."BankAccount"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Payment" ADD CONSTRAINT "Payment_voidedByUserId_fkey" FOREIGN KEY ("voidedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_workspaceId_paymentId_fkey" FOREIGN KEY ("workspaceId", "paymentId") REFERENCES "public"."Payment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_workspaceId_invoiceId_fkey" FOREIGN KEY ("workspaceId", "invoiceId") REFERENCES "public"."Invoice"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAuditEvent" ADD CONSTRAINT "PaymentAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAuditEvent" ADD CONSTRAINT "PaymentAuditEvent_workspaceId_paymentId_fkey" FOREIGN KEY ("workspaceId", "paymentId") REFERENCES "public"."Payment"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PaymentAuditEvent" ADD CONSTRAINT "PaymentAuditEvent_performedByUserId_fkey" FOREIGN KEY ("performedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive_amount" CHECK (amount > 0);
ALTER TABLE "PaymentAllocation" ADD CONSTRAINT "PaymentAllocation_positive_amount" CHECK (amount > 0);
CREATE UNIQUE INDEX "PaymentAllocation_active_invoice" ON "PaymentAllocation" ("workspaceId", "paymentId", "invoiceId") WHERE "removedAt" IS NULL;
