-- Apply with DATABASE_URL configured for the target tenant schema.
-- Existing tenant provisioning also installs these objects for newly created schemas.

CREATE TYPE "ClientType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED');
CREATE TYPE "ClientAddressType" AS ENUM ('MAIN', 'BILLING', 'REGISTERED', 'MAILING', 'OTHER');
CREATE TYPE "ClientContactStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "ActivityType" AS ENUM ('NOTE', 'PHONE_CALL', 'MEETING', 'EMAIL', 'OTHER');
CREATE TYPE "ActivitySource" AS ENUM ('MANUAL', 'SYSTEM', 'AI');
CREATE TYPE "CaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED');
CREATE TYPE "CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

CREATE TABLE "DomainCounter" (
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "value" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DomainCounter_pkey" PRIMARY KEY ("workspaceId", "name")
);

CREATE TABLE "Tag" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseType" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CaseType_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PracticeArea" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PracticeArea_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Client" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "clientNumber" TEXT NOT NULL, "type" "ClientType" NOT NULL,
  "displayName" TEXT NOT NULL, "firstName" TEXT, "lastName" TEXT, "organizationName" TEXT,
  "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE', "email" TEXT, "phone" TEXT, "website" TEXT,
  "preferredLanguage" TEXT, "notes" TEXT, "customFields" JSONB, "responsibleUserId" TEXT,
  "primaryAddressId" TEXT, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientAddress" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "type" "ClientAddressType" NOT NULL DEFAULT 'MAIN',
  "street" TEXT, "streetAdditional" TEXT, "city" TEXT, "postalCode" TEXT, "stateOrRegion" TEXT, "country" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientContact" (
  "id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL,
  "position" TEXT, "email" TEXT, "phone" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT,
  "status" "ClientContactStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "Case" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseNumber" TEXT NOT NULL, "clientId" TEXT NOT NULL,
  "name" TEXT NOT NULL, "description" TEXT, "caseTypeId" TEXT, "practiceAreaId" TEXT,
  "status" "CaseStatus" NOT NULL DEFAULT 'DRAFT', "priority" "CasePriority" NOT NULL DEFAULT 'NORMAL',
  "responsibleUserId" TEXT NOT NULL, "openedDate" TIMESTAMPTZ(3), "closedDate" TIMESTAMPTZ(3), "closingNote" TEXT,
  "externalReference" TEXT, "confidentialityLevel" TEXT, "customFields" JSONB, "createdByUserId" TEXT NOT NULL,
  "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL, CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientActivity" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "relatedCaseId" TEXT,
  "type" "ActivityType" NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "activityDate" TIMESTAMPTZ(3) NOT NULL,
  "source" "ActivitySource" NOT NULL DEFAULT 'MANUAL', "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseActivity" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "type" "ActivityType" NOT NULL,
  "title" TEXT NOT NULL, "description" TEXT, "activityDate" TIMESTAMPTZ(3) NOT NULL,
  "source" "ActivitySource" NOT NULL DEFAULT 'MANUAL', "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CaseActivity_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CaseResponsibility" (
  "id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "userId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false, "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMPTZ(3), "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CaseResponsibility_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "ClientTag" (
  "clientId" TEXT NOT NULL, "tagId" TEXT NOT NULL, CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId", "tagId")
);
CREATE TABLE "CaseTag" (
  "caseId" TEXT NOT NULL, "tagId" TEXT NOT NULL, CONSTRAINT "CaseTag_pkey" PRIMARY KEY ("caseId", "tagId")
);

CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "Tag"("workspaceId", "name");
CREATE UNIQUE INDEX "CaseType_workspaceId_name_key" ON "CaseType"("workspaceId", "name");
CREATE UNIQUE INDEX "PracticeArea_workspaceId_name_key" ON "PracticeArea"("workspaceId", "name");
CREATE UNIQUE INDEX "Client_workspaceId_clientNumber_key" ON "Client"("workspaceId", "clientNumber");
CREATE UNIQUE INDEX "Client_primaryAddressId_key" ON "Client"("primaryAddressId");
CREATE UNIQUE INDEX "Case_workspaceId_caseNumber_key" ON "Case"("workspaceId", "caseNumber");
CREATE UNIQUE INDEX "ClientAddress_one_primary_per_client" ON "ClientAddress"("clientId") WHERE "isPrimary";
CREATE UNIQUE INDEX "ClientContact_one_primary_active_per_client" ON "ClientContact"("clientId") WHERE "isPrimary" AND "status" = 'ACTIVE';
CREATE UNIQUE INDEX "CaseResponsibility_one_primary_active_per_case" ON "CaseResponsibility"("caseId") WHERE "isPrimary" AND "endedAt" IS NULL;

ALTER TABLE "Client" ADD CONSTRAINT "Client_primaryAddressId_fkey" FOREIGN KEY ("primaryAddressId") REFERENCES "ClientAddress"("id") ON DELETE SET NULL;
ALTER TABLE "ClientAddress" ADD CONSTRAINT "ClientAddress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
ALTER TABLE "ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
ALTER TABLE "Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT;
ALTER TABLE "Case" ADD CONSTRAINT "Case_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "CaseType"("id") ON DELETE SET NULL;
ALTER TABLE "Case" ADD CONSTRAINT "Case_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "PracticeArea"("id") ON DELETE SET NULL;
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
ALTER TABLE "ClientActivity" ADD CONSTRAINT "ClientActivity_relatedCaseId_fkey" FOREIGN KEY ("relatedCaseId") REFERENCES "Case"("id") ON DELETE SET NULL;
ALTER TABLE "CaseActivity" ADD CONSTRAINT "CaseActivity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE;
ALTER TABLE "CaseResponsibility" ADD CONSTRAINT "CaseResponsibility_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE;
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE;
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE;
ALTER TABLE "CaseTag" ADD CONSTRAINT "CaseTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE CASCADE;
ALTER TABLE "CaseTag" ADD CONSTRAINT "CaseTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE;
