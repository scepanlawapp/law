-- AlterTable
ALTER TABLE "public"."OrganizationSettings" ALTER COLUMN "availableVatRates" DROP DEFAULT,
ALTER COLUMN "allowedCurrencyCodes" DROP DEFAULT,
ALTER COLUMN "allowedSefAttachmentFileExtensions" DROP DEFAULT;
