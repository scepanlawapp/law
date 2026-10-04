CREATE TYPE "SefEnvironment" AS ENUM ('DEMO', 'PRODUCTION');
CREATE TYPE "InvoiceNumberResetPolicy" AS ENUM ('NEVER', 'YEARLY', 'MONTHLY');
CREATE TYPE "PaymentMethodPreference" AS ENUM ('BANK_TRANSFER', 'CASH', 'CARD', 'OTHER');
CREATE TYPE "ExchangeRateSource" AS ENUM ('NBS_MIDDLE', 'NBS_BUY', 'NBS_SELL', 'MANUAL');

CREATE TABLE "OrganizationSettings" (
    "workspaceId" TEXT NOT NULL,
    "legalName" TEXT,
    "displayName" TEXT,
    "taxId" TEXT,
    "registrationNumber" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL DEFAULT 'RS',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "jbkjs" TEXT,
    "vatRegistered" BOOLEAN NOT NULL DEFAULT false,
    "defaultVatRate" DECIMAL(5,2),
    "availableVatRates" JSONB NOT NULL DEFAULT '[0, 10, 20]',
    "defaultTaxCategoryCode" TEXT,
    "defaultTaxExemptionReasonCode" TEXT,
    "defaultTaxExemptionReasonText" TEXT,
    "cashAccountingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sefEnabled" BOOLEAN NOT NULL DEFAULT false,
    "sefEnvironment" "SefEnvironment" NOT NULL DEFAULT 'DEMO',
    "sefApiKeyCiphertext" TEXT,
    "sefApiKeyIv" TEXT,
    "sefApiKeyAuthTag" TEXT,
    "invoiceNumberPattern" TEXT NOT NULL DEFAULT '{YYYY}-{SEQ:6}',
    "invoiceNumberStartingSequence" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumberIncrementBy" INTEGER NOT NULL DEFAULT 1,
    "invoiceNumberResetPolicy" "InvoiceNumberResetPolicy" NOT NULL DEFAULT 'YEARLY',
    "invoiceNumberAllowManualOverride" BOOLEAN NOT NULL DEFAULT true,
    "defaultPaymentTermDays" INTEGER NOT NULL DEFAULT 15,
    "defaultPaymentMethod" "PaymentMethodPreference" NOT NULL DEFAULT 'BANK_TRANSFER',
    "defaultPaymentModel" TEXT,
    "paymentReferencePattern" TEXT,
    "defaultCurrencyCode" TEXT NOT NULL DEFAULT 'RSD',
    "allowedCurrencyCodes" JSONB NOT NULL DEFAULT '["RSD"]',
    "exchangeRateSource" "ExchangeRateSource" NOT NULL DEFAULT 'NBS_MIDDLE',
    "allowManualExchangeRate" BOOLEAN NOT NULL DEFAULT true,
    "exchangeRatePrecision" INTEGER NOT NULL DEFAULT 4,
    "amountPrecision" INTEGER NOT NULL DEFAULT 2,
    "defaultIssuePlace" TEXT,
    "defaultLanguage" TEXT NOT NULL DEFAULT 'sr-Latn',
    "defaultUnitOfMeasure" TEXT,
    "defaultNote" TEXT,
    "defaultFooterText" TEXT,
    "includeGeneratedInvoicePdf" BOOLEAN NOT NULL DEFAULT false,
    "includeUserAttachments" BOOLEAN NOT NULL DEFAULT true,
    "allowedSefAttachmentFileExtensions" JSONB NOT NULL DEFAULT '[]',
    "maxSefAttachmentCount" INTEGER,
    "maxSefSingleFileSizeMb" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "OrganizationSettings_pkey" PRIMARY KEY ("workspaceId")
);

CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT,
    "accountNumber" TEXT,
    "iban" TEXT,
    "swiftBic" TEXT,
    "currencyCode" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "InvoiceNumberSequenceState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "lastSequenceValue" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "InvoiceNumberSequenceState_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BankAccount_workspaceId_active_idx" ON "BankAccount"("workspaceId", "active");
CREATE INDEX "BankAccount_workspaceId_isDefault_idx" ON "BankAccount"("workspaceId", "isDefault");
CREATE UNIQUE INDEX "InvoiceNumberSequenceState_workspaceId_periodKey_key" ON "InvoiceNumberSequenceState"("workspaceId", "periodKey");

ALTER TABLE "OrganizationSettings" ADD CONSTRAINT "OrganizationSettings_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InvoiceNumberSequenceState" ADD CONSTRAINT "InvoiceNumberSequenceState_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
