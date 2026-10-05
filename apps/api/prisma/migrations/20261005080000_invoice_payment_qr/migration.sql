CREATE TYPE "PaymentQrStandard" AS ENUM ('NBS_IPS');

ALTER TABLE "OrganizationSettings"
ADD COLUMN "paymentQrEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "paymentQrStandard" "PaymentQrStandard" NOT NULL DEFAULT 'NBS_IPS',
ADD COLUMN "paymentQrAccountId" TEXT,
ADD COLUMN "paymentQrPurposeTemplate" TEXT NOT NULL DEFAULT 'Plaćanje po fakturi {{invoiceNumber}}',
ADD COLUMN "paymentQrReferenceModel" TEXT,
ADD COLUMN "paymentQrReferenceTemplate" TEXT;

CREATE INDEX "OrganizationSettings_paymentQrAccountId_idx"
ON "OrganizationSettings"("paymentQrAccountId");

ALTER TABLE "OrganizationSettings"
ADD CONSTRAINT "OrganizationSettings_paymentQrAccountId_fkey"
FOREIGN KEY ("paymentQrAccountId") REFERENCES "BankAccount"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
