-- Additive Phase 04 extensibility migration.

CREATE TYPE "DocumentSource" AS ENUM ('UPLOAD', 'EMAIL', 'API', 'GENERATED', 'SCAN');
CREATE TYPE "DocumentVisibility" AS ENUM ('INTERNAL', 'CLIENT_SHARED');
CREATE TYPE "CustomFieldEntityType" AS ENUM ('CLIENT', 'PARTY', 'MATTER', 'PROCEEDING', 'DOCUMENT');
CREATE TYPE "CustomFieldDataType" AS ENUM ('TEXT', 'TEXTAREA', 'INTEGER', 'DECIMAL', 'MONEY', 'DATE', 'DATETIME', 'BOOLEAN', 'SINGLE_SELECT', 'MULTI_SELECT', 'PARTY_REFERENCE', 'CLIENT_REFERENCE', 'USER_REFERENCE');
CREATE TYPE "ActivityEntityType" AS ENUM ('CLIENT', 'MATTER', 'MATTER_CLIENT', 'PARTICIPANT', 'PROCEEDING', 'DOCUMENT');

CREATE TABLE "Document" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "originalFilename" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "title" TEXT,
  "categoryId" TEXT,
  "documentDate" TIMESTAMPTZ(3),
  "source" "DocumentSource" NOT NULL DEFAULT 'UPLOAD',
  "visibility" "DocumentVisibility" NOT NULL DEFAULT 'INTERNAL',
  "description" TEXT,
  "uploadedByUserId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "archivedAt" TIMESTAMPTZ(3),
  CONSTRAINT "Document_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "DocumentCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "Document_workspaceId_storageKey_key" ON "Document"("workspaceId", "storageKey");
CREATE INDEX "Document_workspaceId_createdAt_idx" ON "Document"("workspaceId", "createdAt");
CREATE INDEX "Document_workspaceId_categoryId_documentDate_idx" ON "Document"("workspaceId", "categoryId", "documentDate");
CREATE INDEX "Document_workspaceId_archivedAt_idx" ON "Document"("workspaceId", "archivedAt");

CREATE TABLE "ClientDocument" (
  "clientId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("clientId", "documentId"),
  CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClientDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ClientDocument_documentId_idx" ON "ClientDocument"("documentId");

CREATE TABLE "MatterDocument" (
  "matterId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MatterDocument_pkey" PRIMARY KEY ("matterId", "documentId"),
  CONSTRAINT "MatterDocument_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MatterDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "MatterDocument_documentId_idx" ON "MatterDocument"("documentId");

CREATE TABLE "ProceedingDocument" (
  "proceedingId" TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProceedingDocument_pkey" PRIMARY KEY ("proceedingId", "documentId"),
  CONSTRAINT "ProceedingDocument_proceedingId_fkey" FOREIGN KEY ("proceedingId") REFERENCES "Proceeding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProceedingDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ProceedingDocument_documentId_idx" ON "ProceedingDocument"("documentId");

CREATE TABLE "CustomFieldDefinition" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "entityType" "CustomFieldEntityType" NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "dataType" "CustomFieldDataType" NOT NULL,
  "practiceAreaId" TEXT,
  "isRequired" BOOLEAN NOT NULL DEFAULT false,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomFieldDefinition_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "PracticeArea"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldDefinition_workspaceId_entityType_code_key" ON "CustomFieldDefinition"("workspaceId", "entityType", "code");
CREATE INDEX "CustomFieldDefinition_workspaceId_entityType_isActive_sortOrder_idx" ON "CustomFieldDefinition"("workspaceId", "entityType", "isActive", "sortOrder");
CREATE INDEX "CustomFieldDefinition_workspaceId_practiceAreaId_idx" ON "CustomFieldDefinition"("workspaceId", "practiceAreaId");

CREATE TABLE "CustomFieldOption" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "definitionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "CustomFieldOption_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldOption_definitionId_code_key" ON "CustomFieldOption"("definitionId", "code");
CREATE INDEX "CustomFieldOption_definitionId_isActive_sortOrder_idx" ON "CustomFieldOption"("definitionId", "isActive", "sortOrder");

CREATE TABLE "CustomFieldValue" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "definitionId" TEXT NOT NULL,
  "entityType" "CustomFieldEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "value" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  "partyId" TEXT,
  "clientId" TEXT,
  "matterId" TEXT,
  "proceedingId" TEXT,
  "documentId" TEXT,
  CONSTRAINT "CustomFieldValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "CustomFieldDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_partyId_fkey" FOREIGN KEY ("partyId") REFERENCES "Party"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_proceedingId_fkey" FOREIGN KEY ("proceedingId") REFERENCES "Proceeding"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CustomFieldValue_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "CustomFieldValue_workspaceId_definitionId_entityType_entityId_key" ON "CustomFieldValue"("workspaceId", "definitionId", "entityType", "entityId");
CREATE INDEX "CustomFieldValue_workspaceId_entityType_entityId_idx" ON "CustomFieldValue"("workspaceId", "entityType", "entityId");

CREATE TABLE "ActivityEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "entityType" "ActivityEntityType" NOT NULL,
  "entityId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "payload" JSONB,
  "clientId" TEXT,
  "matterId" TEXT,
  "documentId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ActivityEvent_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityEvent_matterId_fkey" FOREIGN KEY ("matterId") REFERENCES "Matter"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ActivityEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "ActivityEvent_workspaceId_entityType_entityId_createdAt_idx" ON "ActivityEvent"("workspaceId", "entityType", "entityId", "createdAt");
CREATE INDEX "ActivityEvent_workspaceId_clientId_createdAt_idx" ON "ActivityEvent"("workspaceId", "clientId", "createdAt");
CREATE INDEX "ActivityEvent_workspaceId_matterId_createdAt_idx" ON "ActivityEvent"("workspaceId", "matterId", "createdAt");
