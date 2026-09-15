export function legalSchemaStatements(schemaName: string): string[] {
  const q = (name: string) => `"${schemaName}"."${name}"`;
  const enumType = (name: string, values: string[]) =>
    `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${name}' AND n.nspname = '${schemaName}') THEN CREATE TYPE ${q(name)} AS ENUM (${values.map((value) => `'${value}'`).join(", ")}); END IF; END $$;`;
  const table = (name: string, body: string) =>
    `CREATE TABLE IF NOT EXISTS ${q(name)} (${body})`;
  const index = (name: string, tableName: string, columns: string) =>
    `CREATE INDEX IF NOT EXISTS "${name}" ON ${q(tableName)}(${columns})`;
  const uniqueIndex = (name: string, tableName: string, columns: string) =>
    `CREATE UNIQUE INDEX IF NOT EXISTS "${name}" ON ${q(tableName)}(${columns})`;

  return [
    enumType("PartyType", ["PERSON", "ORGANIZATION"]),
    enumType("PartyContactPointType", [
      "EMAIL",
      "PHONE",
      "MOBILE",
      "FAX",
      "WEBSITE",
      "OTHER",
    ]),
    enumType("PartyIdentifierType", [
      "NATIONAL_ID",
      "TAX_ID",
      "REGISTRATION_ID",
      "PASSPORT",
      "ID_CARD",
      "VAT_ID",
      "OTHER",
    ]),
    enumType("PartyAddressType", [
      "PRIMARY",
      "REGISTERED",
      "MAILING",
      "BILLING",
      "OTHER",
    ]),
    enumType("ClientStatus", ["ACTIVE", "INACTIVE"]),
    enumType("MatterState", ["DRAFT", "OPEN", "CLOSED"]),
    enumType("MatterPriority", ["LOW", "NORMAL", "HIGH", "URGENT"]),
    enumType("ProceedingStatus", ["OPEN", "SUSPENDED", "CLOSED", "OTHER"]),
    table(
      "Party",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "type" ${q("PartyType")} NOT NULL,
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
      "archivedAt" TIMESTAMPTZ(3)
    `,
    ),
    index(
      "Party_workspaceId_displayName_idx",
      "Party",
      '"workspaceId", "displayName"',
    ),
    index("Party_workspaceId_type_idx", "Party", '"workspaceId", "type"'),
    table(
      "PartyContactPoint",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "partyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "type" ${q("PartyContactPointType")} NOT NULL,
      "value" TEXT NOT NULL,
      "label" TEXT,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    index(
      "PartyContactPoint_partyId_type_idx",
      "PartyContactPoint",
      '"partyId", "type"',
    ),
    index(
      "PartyContactPoint_type_value_idx",
      "PartyContactPoint",
      '"type", "value"',
    ),
    table(
      "PartyIdentifier",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "partyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "type" ${q("PartyIdentifierType")} NOT NULL,
      "value" TEXT NOT NULL,
      "countryCode" TEXT,
      "issuer" TEXT,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    index(
      "PartyIdentifier_partyId_type_idx",
      "PartyIdentifier",
      '"partyId", "type"',
    ),
    index(
      "PartyIdentifier_type_value_idx",
      "PartyIdentifier",
      '"type", "value"',
    ),
    table(
      "PartyAddress",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "partyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "type" ${q("PartyAddressType")} NOT NULL DEFAULT 'PRIMARY',
      "addressLine1" TEXT NOT NULL,
      "addressLine2" TEXT,
      "city" TEXT,
      "postalCode" TEXT,
      "region" TEXT,
      "countryCode" TEXT,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    index("PartyAddress_partyId_type_idx", "PartyAddress", '"partyId", "type"'),
    table(
      "OrganizationRelationshipType",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "OrganizationRelationshipType_workspaceId_code_key",
      "OrganizationRelationshipType",
      '"workspaceId", "code"',
    ),
    index(
      "OrganizationRelationshipType_workspaceId_isActive_sortOrder_idx",
      "OrganizationRelationshipType",
      '"workspaceId", "isActive", "sortOrder"',
    ),
    table(
      "PartyRelationship",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "fromPartyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "toPartyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "relationshipTypeId" TEXT NOT NULL REFERENCES ${q("OrganizationRelationshipType")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "jobTitle" TEXT,
      "department" TEXT,
      "isPrimaryContact" BOOLEAN NOT NULL DEFAULT false,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "PartyRelationship_fromPartyId_toPartyId_relationshipTypeId_key",
      "PartyRelationship",
      '"fromPartyId", "toPartyId", "relationshipTypeId"',
    ),
    index(
      "PartyRelationship_workspaceId_fromPartyId_isActive_idx",
      "PartyRelationship",
      '"workspaceId", "fromPartyId", "isActive"',
    ),
    index(
      "PartyRelationship_workspaceId_toPartyId_isActive_idx",
      "PartyRelationship",
      '"workspaceId", "toPartyId", "isActive"',
    ),
    table(
      "Client",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "partyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "clientCode" TEXT NOT NULL,
      "status" ${q("ClientStatus")} NOT NULL DEFAULT 'ACTIVE',
      "responsibleUserId" TEXT,
      "openedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "closedAt" TIMESTAMPTZ(3),
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdByUserId" TEXT,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL,
      "updatedByUserId" TEXT,
      "archivedAt" TIMESTAMPTZ(3)
    `,
    ),
    uniqueIndex(
      "Client_workspaceId_clientCode_key",
      "Client",
      '"workspaceId", "clientCode"',
    ),
    uniqueIndex(
      "Client_workspaceId_partyId_key",
      "Client",
      '"workspaceId", "partyId"',
    ),
    index("Client_workspaceId_status_idx", "Client", '"workspaceId", "status"'),
    table(
      "PracticeArea",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "parentId" TEXT REFERENCES ${q("PracticeArea")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "PracticeArea_workspaceId_code_key",
      "PracticeArea",
      '"workspaceId", "code"',
    ),
    index(
      "PracticeArea_workspaceId_isActive_sortOrder_idx",
      "PracticeArea",
      '"workspaceId", "isActive", "sortOrder"',
    ),
    table(
      "MatterStage",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "practiceAreaId" TEXT REFERENCES ${q("PracticeArea")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "MatterStage_workspaceId_code_key",
      "MatterStage",
      '"workspaceId", "code"',
    ),
    table(
      "ParticipantRole",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "ParticipantRole_workspaceId_code_key",
      "ParticipantRole",
      '"workspaceId", "code"',
    ),
    table(
      "ProceedingType",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "ProceedingType_workspaceId_code_key",
      "ProceedingType",
      '"workspaceId", "code"',
    ),
    table(
      "DocumentCategory",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "isActive" BOOLEAN NOT NULL DEFAULT true,
      "isSystemSeed" BOOLEAN NOT NULL DEFAULT false,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "DocumentCategory_workspaceId_code_key",
      "DocumentCategory",
      '"workspaceId", "code"',
    ),
    table(
      "MatterNumberCounter",
      `
      "workspaceId" TEXT NOT NULL,
      "year" INTEGER NOT NULL,
      "nextValue" INTEGER NOT NULL DEFAULT 1,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL,
      PRIMARY KEY ("workspaceId", "year")
    `,
    ),
    table(
      "Matter",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "internalNumber" TEXT,
      "title" TEXT NOT NULL,
      "state" ${q("MatterState")} NOT NULL DEFAULT 'DRAFT',
      "practiceAreaId" TEXT REFERENCES ${q("PracticeArea")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "stageId" TEXT REFERENCES ${q("MatterStage")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "priority" ${q("MatterPriority")} NOT NULL DEFAULT 'NORMAL',
      "responsibleUserId" TEXT,
      "description" TEXT,
      "openedAt" TIMESTAMPTZ(3),
      "closedAt" TIMESTAMPTZ(3),
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdByUserId" TEXT,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL,
      "updatedByUserId" TEXT,
      "archivedAt" TIMESTAMPTZ(3)
    `,
    ),
    uniqueIndex(
      "Matter_workspaceId_internalNumber_key",
      "Matter",
      '"workspaceId", "internalNumber"',
    ),
    index("Matter_workspaceId_state_idx", "Matter", '"workspaceId", "state"'),
    index(
      "Matter_workspaceId_priority_idx",
      "Matter",
      '"workspaceId", "priority"',
    ),
    table(
      "MatterClient",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "matterId" TEXT NOT NULL REFERENCES ${q("Matter")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "clientId" TEXT NOT NULL REFERENCES ${q("Client")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "isPrimary" BOOLEAN NOT NULL DEFAULT false,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `,
    ),
    uniqueIndex(
      "MatterClient_matterId_clientId_key",
      "MatterClient",
      '"matterId", "clientId"',
    ),
    `CREATE UNIQUE INDEX IF NOT EXISTS "MatterClient_matterId_primary_key" ON ${q("MatterClient")}("matterId") WHERE "isPrimary" = true`,
    table(
      "MatterParticipant",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "matterId" TEXT NOT NULL REFERENCES ${q("Matter")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "partyId" TEXT NOT NULL REFERENCES ${q("Party")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    uniqueIndex(
      "MatterParticipant_matterId_partyId_key",
      "MatterParticipant",
      '"matterId", "partyId"',
    ),
    table(
      "MatterParticipantRole",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "participantId" TEXT NOT NULL REFERENCES ${q("MatterParticipant")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "roleId" TEXT NOT NULL REFERENCES ${q("ParticipantRole")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    `,
    ),
    uniqueIndex(
      "MatterParticipantRole_participantId_roleId_key",
      "MatterParticipantRole",
      '"participantId", "roleId"',
    ),
    table(
      "Proceeding",
      `
      "id" TEXT NOT NULL PRIMARY KEY,
      "workspaceId" TEXT NOT NULL,
      "matterId" TEXT NOT NULL REFERENCES ${q("Matter")}("id") ON DELETE CASCADE ON UPDATE CASCADE,
      "typeId" TEXT NOT NULL REFERENCES ${q("ProceedingType")}("id") ON DELETE RESTRICT ON UPDATE CASCADE,
      "externalNumber" TEXT,
      "authorityName" TEXT,
      "judgeName" TEXT,
      "status" ${q("ProceedingStatus")},
      "startedAt" TIMESTAMPTZ(3),
      "endedAt" TIMESTAMPTZ(3),
      "notes" TEXT,
      "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMPTZ(3) NOT NULL
    `,
    ),
    index(
      "Proceeding_workspaceId_matterId_idx",
      "Proceeding",
      '"workspaceId", "matterId"',
    ),
  ];
}

export function legalLookupSeedStatements(
  schemaName: string,
  workspaceId: string,
): string[] {
  if (!/^[a-zA-Z0-9_-]+$/.test(workspaceId)) {
    throw new Error(`Invalid workspace id: ${workspaceId}`);
  }

  const workspace = workspaceId.replace(/'/g, "''");
  const q = (name: string) => `"${schemaName}"."${name}"`;
  const values: Record<string, Array<[string, string]>> = {
    OrganizationRelationshipType: [
      ["EMPLOYEE", "Employee"],
      ["DIRECTOR", "Director"],
      ["LEGAL_REPRESENTATIVE", "Legal representative"],
      ["AUTHORIZED_PERSON", "Authorized person"],
      ["BILLING_CONTACT", "Billing contact"],
    ],
    PracticeArea: [
      ["CIVIL", "Civil law"],
      ["CRIMINAL", "Criminal law"],
      ["COMMERCIAL", "Commercial law"],
      ["FAMILY", "Family law"],
      ["EMPLOYMENT", "Employment law"],
      ["ADMINISTRATIVE", "Administrative law"],
      ["ENFORCEMENT", "Enforcement"],
      ["REAL_ESTATE", "Real estate"],
    ],
    ParticipantRole: [
      ["PLAINTIFF", "Plaintiff"],
      ["DEFENDANT", "Defendant"],
      ["APPLICANT", "Applicant"],
      ["RESPONDENT", "Respondent"],
      ["WITNESS", "Witness"],
      ["EXPERT", "Expert"],
      ["LEGAL_REPRESENTATIVE", "Legal representative"],
    ],
    ProceedingType: [
      ["FIRST_INSTANCE", "First instance"],
      ["APPEAL", "Appeal"],
      ["ENFORCEMENT", "Enforcement"],
      ["ADMINISTRATIVE", "Administrative"],
      ["ARBITRATION", "Arbitration"],
    ],
    DocumentCategory: [
      ["PLEADING", "Pleading"],
      ["DECISION", "Decision"],
      ["CONTRACT", "Contract"],
      ["EVIDENCE", "Evidence"],
      ["CORRESPONDENCE", "Correspondence"],
      ["IDENTIFICATION", "Identification document"],
    ],
  };

  return Object.entries(values).map(([table, entries]) => {
    const rows = entries
      .map(
        ([code, name], index) =>
          `(gen_random_uuid(), '${workspace}', '${code}', '${name.replace(/'/g, "''")}', true, true, ${index}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      )
      .join(", ");
    return `INSERT INTO ${q(table)} ("id", "workspaceId", "code", "name", "isActive", "isSystemSeed", "sortOrder", "createdAt", "updatedAt") VALUES ${rows} ON CONFLICT ("workspaceId", "code") DO UPDATE SET "name" = EXCLUDED."name", "isActive" = true, "isSystemSeed" = true, "sortOrder" = EXCLUDED."sortOrder", "updatedAt" = CURRENT_TIMESTAMP`;
  });
}
