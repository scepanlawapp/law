export function extensibilitySchemaStatements(schemaName: string): string[] {
  const q = (name: string) => `"${schemaName}"."${name}"`;
  const enumType = (name: string, values: string[]) =>
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${name}' AND n.nspname = '${schemaName}') THEN CREATE TYPE ${q(name)} AS ENUM (${values.map((value) => `'${value}'`).join(", ")}); END IF; END $$;`;
  const create = (name: string, body: string) =>
    `CREATE TABLE IF NOT EXISTS ${q(name)} (${body})`;
  const index = (name: string, table: string, columns: string) =>
    `CREATE INDEX IF NOT EXISTS "${name}" ON ${q(table)}(${columns})`;
  return [
    enumType("DocumentSource", ["UPLOAD", "EMAIL", "API", "GENERATED", "SCAN"]),
    enumType("DocumentVisibility", ["INTERNAL", "CLIENT_SHARED"]),
    enumType("CustomFieldEntityType", [
      "CLIENT",
      "PARTY",
      "MATTER",
      "PROCEEDING",
      "DOCUMENT",
    ]),
    enumType("CustomFieldDataType", [
      "TEXT",
      "TEXTAREA",
      "INTEGER",
      "DECIMAL",
      "MONEY",
      "DATE",
      "DATETIME",
      "BOOLEAN",
      "SINGLE_SELECT",
      "MULTI_SELECT",
      "PARTY_REFERENCE",
      "CLIENT_REFERENCE",
      "USER_REFERENCE",
    ]),
    enumType("ActivityEntityType", [
      "CLIENT",
      "MATTER",
      "MATTER_CLIENT",
      "PARTICIPANT",
      "PROCEEDING",
      "DOCUMENT",
    ]),
    create(
      "Document",
      `
      "id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "originalFilename" TEXT NOT NULL,
      "storageKey" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sizeBytes" INTEGER NOT NULL,
      "checksum" TEXT NOT NULL, "title" TEXT, "categoryId" TEXT,
      "documentDate" TIMESTAMPTZ(3), "source" ${q("DocumentSource")} NOT NULL DEFAULT 'UPLOAD',
      "visibility" ${q("DocumentVisibility")} NOT NULL DEFAULT 'INTERNAL', "description" TEXT,
      "uploadedByUserId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL, "archivedAt" TIMESTAMPTZ(3),
      FOREIGN KEY ("categoryId") REFERENCES ${q("DocumentCategory")}("id") ON DELETE RESTRICT ON UPDATE CASCADE
    `,
    ),
    `CREATE UNIQUE INDEX IF NOT EXISTS "Document_workspaceId_storageKey_key" ON ${q("Document")}("workspaceId", "storageKey")`,
    index(
      "Document_workspaceId_createdAt_idx",
      "Document",
      '"workspaceId", "createdAt"',
    ),
    index(
      "Document_workspaceId_categoryId_documentDate_idx",
      "Document",
      '"workspaceId", "categoryId", "documentDate"',
    ),
    create(
      "ClientDocument",
      `"clientId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("clientId", "documentId"), FOREIGN KEY ("clientId") REFERENCES ${q("Client")}("id") ON DELETE CASCADE, FOREIGN KEY ("documentId") REFERENCES ${q("Document")}("id") ON DELETE CASCADE`,
    ),
    create(
      "MatterDocument",
      `"matterId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("matterId", "documentId"), FOREIGN KEY ("matterId") REFERENCES ${q("Matter")}("id") ON DELETE CASCADE, FOREIGN KEY ("documentId") REFERENCES ${q("Document")}("id") ON DELETE CASCADE`,
    ),
    create(
      "ProceedingDocument",
      `"proceedingId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY ("proceedingId", "documentId"), FOREIGN KEY ("proceedingId") REFERENCES ${q("Proceeding")}("id") ON DELETE CASCADE, FOREIGN KEY ("documentId") REFERENCES ${q("Document")}("id") ON DELETE CASCADE`,
    ),
    create(
      "CustomFieldDefinition",
      `"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "entityType" ${q("CustomFieldEntityType")} NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL, "dataType" ${q("CustomFieldDataType")} NOT NULL, "practiceAreaId" TEXT, "isRequired" BOOLEAN NOT NULL DEFAULT false, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL, FOREIGN KEY ("practiceAreaId") REFERENCES ${q("PracticeArea")}("id") ON DELETE RESTRICT`,
    ),
    `CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldDefinition_workspaceId_entityType_code_key" ON ${q("CustomFieldDefinition")}("workspaceId", "entityType", "code")`,
    create(
      "CustomFieldOption",
      `"id" TEXT PRIMARY KEY, "definitionId" TEXT NOT NULL, "code" TEXT NOT NULL, "label" TEXT NOT NULL, "isActive" BOOLEAN NOT NULL DEFAULT true, "sortOrder" INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL, FOREIGN KEY ("definitionId") REFERENCES ${q("CustomFieldDefinition")}("id") ON DELETE CASCADE`,
    ),
    `CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldOption_definitionId_code_key" ON ${q("CustomFieldOption")}("definitionId", "code")`,
    create(
      "CustomFieldValue",
      `"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "definitionId" TEXT NOT NULL, "entityType" ${q("CustomFieldEntityType")} NOT NULL, "entityId" TEXT NOT NULL, "value" JSONB NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL, "partyId" TEXT, "clientId" TEXT, "matterId" TEXT, "proceedingId" TEXT, "documentId" TEXT, FOREIGN KEY ("definitionId") REFERENCES ${q("CustomFieldDefinition")}("id") ON DELETE RESTRICT`,
    ),
    `CREATE UNIQUE INDEX IF NOT EXISTS "CustomFieldValue_workspaceId_definitionId_entityType_entityId_key" ON ${q("CustomFieldValue")}("workspaceId", "definitionId", "entityType", "entityId")`,
    create(
      "ActivityEvent",
      `"id" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "actorUserId" TEXT, "entityType" ${q("ActivityEntityType")} NOT NULL, "entityId" TEXT NOT NULL, "eventType" TEXT NOT NULL, "payload" JSONB, "clientId" TEXT, "matterId" TEXT, "documentId" TEXT, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY ("clientId") REFERENCES ${q("Client")}("id") ON DELETE CASCADE, FOREIGN KEY ("matterId") REFERENCES ${q("Matter")}("id") ON DELETE CASCADE, FOREIGN KEY ("documentId") REFERENCES ${q("Document")}("id") ON DELETE CASCADE`,
    ),
    index(
      "ActivityEvent_workspaceId_entityType_entityId_createdAt_idx",
      "ActivityEvent",
      '"workspaceId", "entityType", "entityId", "createdAt"',
    ),
  ];
}
