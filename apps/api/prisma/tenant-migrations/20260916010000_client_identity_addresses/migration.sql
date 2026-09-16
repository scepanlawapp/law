-- Apply with DATABASE_URL configured for the target tenant schema.
-- Extends clients with identity data and makes addresses fully structured.

ALTER TABLE "Client"
  ADD COLUMN "isDomestic" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "jmbg" TEXT,
  ADD COLUMN "taxNumber" TEXT,
  ADD COLUMN "registrationNumber" TEXT;

ALTER TABLE "ClientAddress"
  ADD COLUMN "addressType" TEXT,
  ADD COLUMN "note" TEXT;

UPDATE "ClientAddress"
SET "addressType" = "type"::text,
    "street" = COALESCE(NULLIF("street", ''), 'N/A'),
    "city" = COALESCE(NULLIF("city", ''), 'N/A'),
    "postalCode" = COALESCE(NULLIF("postalCode", ''), 'N/A'),
    "country" = COALESCE(NULLIF("country", ''), 'RS')
WHERE "addressType" IS NULL
   OR "street" IS NULL
   OR "city" IS NULL
   OR "postalCode" IS NULL
   OR "country" IS NULL;

ALTER TABLE "ClientAddress"
  ALTER COLUMN "addressType" SET NOT NULL,
  ALTER COLUMN "street" SET NOT NULL,
  ALTER COLUMN "city" SET NOT NULL,
  ALTER COLUMN "postalCode" SET NOT NULL,
  ALTER COLUMN "country" SET NOT NULL;

ALTER TABLE "ClientAddress" DROP COLUMN "type";
ALTER TABLE "Client" DROP CONSTRAINT IF EXISTS "Client_primaryAddressId_fkey";
DROP INDEX IF EXISTS "Client_primaryAddressId_key";
ALTER TABLE "Client" DROP COLUMN "primaryAddressId";
DROP TYPE IF EXISTS "ClientAddressType";

CREATE TABLE "ClientIdentificationDocument" (
  "id" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "number" TEXT NOT NULL,
  "issuedDate" DATE,
  "expiredDate" DATE,
  "country" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ClientIdentificationDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClientIdentificationDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE
);

CREATE INDEX "ClientIdentificationDocument_clientId_createdAt_idx"
  ON "ClientIdentificationDocument"("clientId", "createdAt");
