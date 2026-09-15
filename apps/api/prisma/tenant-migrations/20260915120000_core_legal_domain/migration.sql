-- Additive core legal domain migration.
-- Legacy legal tables were not present in the inspected active tenant database.

CREATE TYPE "PartyType" AS ENUM ('PERSON', 'ORGANIZATION');
CREATE TYPE "PartyContactPointType" AS ENUM ('EMAIL', 'PHONE', 'MOBILE', 'FAX', 'WEBSITE', 'OTHER');
CREATE TYPE "PartyIdentifierType" AS ENUM ('NATIONAL_ID', 'TAX_ID', 'REGISTRATION_ID', 'PASSPORT', 'ID_CARD', 'VAT_ID', 'OTHER');
CREATE TYPE "PartyAddressType" AS ENUM ('PRIMARY', 'REGISTERED', 'MAILING', 'BILLING', 'OTHER');
CREATE TYPE "ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "MatterState" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');
CREATE TYPE "MatterPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "ProceedingStatus" AS ENUM ('OPEN', 'SUSPENDED', 'CLOSED', 'OTHER');

CREATE TABLE "Party" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "type" "PartyType" NOT NULL,
  "firstName" TEXT,
  "lastName" TEXT,
  "legalName" TEXT,
  "tradeName" TEXT,
  "displayName" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Party_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Party_workspaceId_displayName_idx" ON "Party"("workspaceId", "displayName");
CREATE INDEX "Party_workspaceId_type_idx" ON "Party"("workspaceId", "type");

CREATE TABLE "PartyContactPoint" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "type" "PartyContactPointType" NOT NULL,
  "value" TEXT NOT NULL,
  "label" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PartyContactPoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartyContactPoint_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PartyContactPoint_partyId_type_idx" ON "PartyContactPoint"("partyId", "type");
CREATE INDEX "PartyContactPoint_type_value_idx" ON "PartyContactPoint"("type", "value");

CREATE TABLE "PartyIdentifier" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "type" "PartyIdentifierType" NOT NULL,
  "value" TEXT NOT NULL,
  "countryCode" TEXT,
  "issuer" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PartyIdentifier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartyIdentifier_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PartyIdentifier_partyId_type_idx" ON "PartyIdentifier"("partyId", "type");
CREATE INDEX "PartyIdentifier_type_value_idx" ON "PartyIdentifier"("type", "value");

CREATE TABLE "PartyAddress" (
  "id" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "type" "PartyAddressType" NOT NULL DEFAULT 'PRIMARY',
  "addressLine1" TEXT NOT NULL,
  "addressLine2" TEXT,
  "city" TEXT,
  "postalCode" TEXT,
  "region" TEXT,
  "countryCode" TEXT,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PartyAddress_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartyAddress_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "PartyAddress_partyId_type_idx" ON "PartyAddress"("partyId", "type");

CREATE TABLE "OrganizationRelationshipType" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "OrganizationRelationshipType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OrganizationRelationshipType_workspaceId_code_key" ON "OrganizationRelationshipType"("workspaceId", "code");
CREATE INDEX "OrganizationRelationshipType_workspaceId_isActive_sortOrder_idx" ON "OrganizationRelationshipType"("workspaceId", "isActive", "sortOrder");

CREATE TABLE "PartyRelationship" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "fromPartyId" TEXT NOT NULL,
  "toPartyId" TEXT NOT NULL,
  "relationshipTypeId" TEXT NOT NULL,
  "jobTitle" TEXT,
  "department" TEXT,
  "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PartyRelationship_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PartyRelationship_fromPartyId_fkey" FOREIGN KEY ("fromPartyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartyRelationship_toPartyId_fkey" FOREIGN KEY ("toPartyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PartyRelationship_relationshipTypeId_fkey" FOREIGN KEY ("relationshipTypeId") REFERENCES "OrganizationRelationshipType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PartyRelationship_fromPartyId_toPartyId_relationshipTypeId_key" ON "PartyRelationship"("fromPartyId", "toPartyId", "relationshipTypeId");
CREATE INDEX "PartyRelationship_workspaceId_fromPartyId_isActive_idx" ON "PartyRelationship"("workspaceId", "fromPartyId", "isActive");
CREATE INDEX "PartyRelationship_workspaceId_toPartyId_isActive_idx" ON "PartyRelationship"("workspaceId", "toPartyId", "isActive");

CREATE TABLE "Client" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "clientCode" TEXT NOT NULL,
  "status" "ClientStatus" NOT NULL DEFAULT 'ACTIVE',
  "responsibleUserId" TEXT,
  "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Client_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Client_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Client_workspaceId_clientCode_key" ON "Client"("workspaceId", "clientCode");
CREATE UNIQUE INDEX "Client_workspaceId_partyId_key" ON "Client"("workspaceId", "partyId");
CREATE INDEX "Client_workspaceId_status_idx" ON "Client"("workspaceId", "status");
CREATE INDEX "Client_workspaceId_partyId_idx" ON "Client"("workspaceId", "partyId");

CREATE TABLE "PracticeArea" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "PracticeArea_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PracticeArea_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PracticeArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PracticeArea_workspaceId_code_key" ON "PracticeArea"("workspaceId", "code");
CREATE INDEX "PracticeArea_workspaceId_isActive_sortOrder_idx" ON "PracticeArea"("workspaceId", "isActive", "sortOrder");

CREATE TABLE "MatterStage" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "practiceAreaId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MatterStage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatterStage_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "PracticeArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatterStage_workspaceId_code_key" ON "MatterStage"("workspaceId", "code");
CREATE INDEX "MatterStage_workspaceId_practiceAreaId_isActive_sortOrder_idx" ON "MatterStage"("workspaceId", "practiceAreaId", "isActive", "sortOrder");

CREATE TABLE "ParticipantRole" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ParticipantRole_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ParticipantRole_workspaceId_code_key" ON "ParticipantRole"("workspaceId", "code");
CREATE INDEX "ParticipantRole_workspaceId_isActive_sortOrder_idx" ON "ParticipantRole"("workspaceId", "isActive", "sortOrder");

CREATE TABLE "ProceedingType" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ProceedingType_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ProceedingType_workspaceId_code_key" ON "ProceedingType"("workspaceId", "code");
CREATE INDEX "ProceedingType_workspaceId_isActive_sortOrder_idx" ON "ProceedingType"("workspaceId", "isActive", "sortOrder");

CREATE TABLE "DocumentCategory" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DocumentCategory_workspaceId_code_key" ON "DocumentCategory"("workspaceId", "code");
CREATE INDEX "DocumentCategory_workspaceId_isActive_sortOrder_idx" ON "DocumentCategory"("workspaceId", "isActive", "sortOrder");

CREATE TABLE "MatterNumberCounter" (
  "workspaceId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "nextValue" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MatterNumberCounter_pkey" PRIMARY KEY ("workspaceId", "year")
);

CREATE TABLE "Matter" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "internalNumber" TEXT,
  "title" TEXT NOT NULL,
  "state" "MatterState" NOT NULL DEFAULT 'DRAFT',
  "practiceAreaId" TEXT,
  "stageId" TEXT,
  "priority" "MatterPriority" NOT NULL DEFAULT 'NORMAL',
  "responsibleUserId" TEXT,
  "description" TEXT,
  "openedAt" TIMESTAMPTZ(3),
  "closedAt" TIMESTAMPTZ(3),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByUserId" TEXT,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "updatedByUserId" TEXT,
  "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Matter_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Matter_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "PracticeArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Matter_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "MatterStage"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Matter_workspaceId_internalNumber_key" ON "Matter"("workspaceId", "internalNumber");
CREATE INDEX "Matter_workspaceId_state_idx" ON "Matter"("workspaceId", "state");
CREATE INDEX "Matter_workspaceId_priority_idx" ON "Matter"("workspaceId", "priority");
CREATE INDEX "Matter_workspaceId_practiceAreaId_idx" ON "Matter"("workspaceId", "practiceAreaId");
CREATE INDEX "Matter_workspaceId_responsibleUserId_idx" ON "Matter"("workspaceId", "responsibleUserId");

CREATE TABLE "MatterClient" (
  "id" TEXT NOT NULL,
  "matterId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatterClient_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatterClient_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatterClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatterClient_matterId_clientId_key" ON "MatterClient"("matterId", "clientId");
CREATE INDEX "MatterClient_clientId_idx" ON "MatterClient"("clientId");
CREATE UNIQUE INDEX "MatterClient_matterId_primary_key" ON "MatterClient"("matterId") WHERE "isPrimary" = true;

CREATE TABLE "MatterParticipant" (
  "id" TEXT NOT NULL,
  "matterId" TEXT NOT NULL,
  "partyId" TEXT NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "MatterParticipant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatterParticipant_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatterParticipant_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatterParticipant_matterId_partyId_key" ON "MatterParticipant"("matterId", "partyId");
CREATE INDEX "MatterParticipant_partyId_idx" ON "MatterParticipant"("partyId");

CREATE TABLE "MatterParticipantRole" (
  "id" TEXT NOT NULL,
  "participantId" TEXT NOT NULL,
  "roleId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatterParticipantRole_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MatterParticipantRole_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "MatterParticipant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatterParticipantRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "ParticipantRole"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MatterParticipantRole_participantId_roleId_key" ON "MatterParticipantRole"("participantId", "roleId");
CREATE INDEX "MatterParticipantRole_roleId_idx" ON "MatterParticipantRole"("roleId");

CREATE TABLE "Proceeding" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "matterId" TEXT NOT NULL,
  "typeId" TEXT NOT NULL,
  "externalNumber" TEXT,
  "authorityName" TEXT,
  "judgeName" TEXT,
  "status" "ProceedingStatus",
  "startedAt" TIMESTAMPTZ(3),
  "endedAt" TIMESTAMPTZ(3),
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "Proceeding_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Proceeding_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Proceeding_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "ProceedingType"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Proceeding_workspaceId_matterId_idx" ON "Proceeding"("workspaceId", "matterId");
CREATE INDEX "Proceeding_workspaceId_externalNumber_idx" ON "Proceeding"("workspaceId", "externalNumber");
