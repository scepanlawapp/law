import { Injectable, Logger } from "@nestjs/common";
import { TenantConnectionManager } from "./tenant-connection-manager";

@Injectable()
export class TenantSchemaProvisioner {
  private readonly logger = new Logger(TenantSchemaProvisioner.name);

  constructor(private readonly connectionManager: TenantConnectionManager) {}

  async provisionTenantDatabase(
    tenantId: string,
    databaseName: string,
  ): Promise<void> {
    await this.connectionManager.createTenantDatabase(databaseName).catch(
      (error: unknown) => {
        if (
          error instanceof Error &&
          /already exists/i.test(error.message)
        ) {
          return;
        }
        throw error;
      },
    );
    await this.provisionTenantSchema("public", tenantId, databaseName);
  }

  async provisionTenantSchema(
    schemaName: string,
    tenantId = schemaName,
    databaseName = schemaName,
  ): Promise<void> {
    if (!/^[a-zA-Z0-9_]+$/.test(schemaName)) {
      throw new Error(`Invalid schema name: ${schemaName}`);
    }

    const domainStatements = [
      ...[
        "ClientType",
        "ClientStatus",
        "ClientAddressType",
        "ClientContactStatus",
        "ActivityType",
        "ActivitySource",
        "CaseStatus",
        "CasePriority",
      ].map(
        (type) =>
          `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = '${type}' AND n.nspname = '${schemaName}') THEN CREATE TYPE "${schemaName}"."${type}" AS ENUM (${type === "ClientType" ? "'INDIVIDUAL', 'ORGANIZATION'" : type === "ClientStatus" ? "'ACTIVE', 'INACTIVE', 'ARCHIVED', 'PROSPECT'" : type === "ClientAddressType" ? "'MAIN', 'BILLING', 'REGISTERED', 'MAILING', 'OTHER'" : type === "ClientContactStatus" ? "'ACTIVE', 'INACTIVE'" : type === "ActivityType" ? "'NOTE', 'PHONE_CALL', 'MEETING', 'EMAIL', 'OTHER'" : type === "ActivitySource" ? "'MANUAL', 'SYSTEM', 'AI'" : type === "CaseStatus" ? "'DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED'" : "'LOW', 'NORMAL', 'HIGH', 'URGENT'"}); END IF; END $$;`,
      ),
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."DomainCounter" ("workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "value" INTEGER NOT NULL DEFAULT 0, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "DomainCounter_pkey" PRIMARY KEY ("workspaceId", "name"))`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."Tag" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "color" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Tag_pkey" PRIMARY KEY ("id"), CONSTRAINT "Tag_workspaceId_name_key" UNIQUE ("workspaceId", "name"))`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."CaseType" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CaseType_pkey" PRIMARY KEY ("id"), CONSTRAINT "CaseType_workspaceId_name_key" UNIQUE ("workspaceId", "name"))`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."PracticeArea" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT true, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PracticeArea_pkey" PRIMARY KEY ("id"), CONSTRAINT "PracticeArea_workspaceId_name_key" UNIQUE ("workspaceId", "name"))`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."Client" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "clientNumber" TEXT NOT NULL, "type" "${schemaName}"."ClientType" NOT NULL, "displayName" TEXT NOT NULL, "firstName" TEXT, "lastName" TEXT, "organizationName" TEXT, "status" "${schemaName}"."ClientStatus" NOT NULL DEFAULT 'ACTIVE', "email" TEXT, "phone" TEXT, "website" TEXT, "preferredLanguage" TEXT, "notes" TEXT, "customFields" JSONB, "responsibleUserId" TEXT, "primaryAddressId" TEXT, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Client_pkey" PRIMARY KEY ("id"), CONSTRAINT "Client_workspaceId_clientNumber_key" UNIQUE ("workspaceId", "clientNumber"), CONSTRAINT "Client_primaryAddressId_key" UNIQUE ("primaryAddressId"))`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ClientAddress" ("id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "type" "${schemaName}"."ClientAddressType" NOT NULL DEFAULT 'MAIN', "street" TEXT, "streetAdditional" TEXT, "city" TEXT, "postalCode" TEXT, "stateOrRegion" TEXT, "country" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id"), CONSTRAINT "ClientAddress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "${schemaName}"."Client"("id") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ClientContact" ("id" TEXT NOT NULL, "clientId" TEXT NOT NULL, "firstName" TEXT NOT NULL, "lastName" TEXT NOT NULL, "position" TEXT, "email" TEXT, "phone" TEXT, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "notes" TEXT, "status" "${schemaName}"."ClientContactStatus" NOT NULL DEFAULT 'ACTIVE', "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id"), CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "${schemaName}"."Client"("id") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."Case" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseNumber" TEXT NOT NULL, "clientId" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT, "caseTypeId" TEXT, "practiceAreaId" TEXT, "status" "${schemaName}"."CaseStatus" NOT NULL DEFAULT 'DRAFT', "priority" "${schemaName}"."CasePriority" NOT NULL DEFAULT 'NORMAL', "responsibleUserId" TEXT NOT NULL, "openedDate" TIMESTAMPTZ(3), "closedDate" TIMESTAMPTZ(3), "closingNote" TEXT, "externalReference" TEXT, "confidentialityLevel" TEXT, "customFields" JSONB, "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "Case_pkey" PRIMARY KEY ("id"), CONSTRAINT "Case_workspaceId_caseNumber_key" UNIQUE ("workspaceId", "caseNumber"), CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "${schemaName}"."Client"("id") ON DELETE RESTRICT, CONSTRAINT "Case_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "${schemaName}"."CaseType"("id") ON DELETE SET NULL, CONSTRAINT "Case_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "${schemaName}"."PracticeArea"("id") ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ClientActivity" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "clientId" TEXT NOT NULL, "relatedCaseId" TEXT, "type" "${schemaName}"."ActivityType" NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "activityDate" TIMESTAMPTZ(3) NOT NULL, "source" "${schemaName}"."ActivitySource" NOT NULL DEFAULT 'MANUAL', "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id"), CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "${schemaName}"."Client"("id") ON DELETE CASCADE, CONSTRAINT "ClientActivity_relatedCaseId_fkey" FOREIGN KEY ("relatedCaseId") REFERENCES "${schemaName}"."Case"("id") ON DELETE SET NULL)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."CaseActivity" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "type" "${schemaName}"."ActivityType" NOT NULL, "title" TEXT NOT NULL, "description" TEXT, "activityDate" TIMESTAMPTZ(3) NOT NULL, "source" "${schemaName}"."ActivitySource" NOT NULL DEFAULT 'MANUAL', "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CaseActivity_pkey" PRIMARY KEY ("id"), CONSTRAINT "CaseActivity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "${schemaName}"."Case"("id") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."CaseResponsibility" ("id" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "caseId" TEXT NOT NULL, "userId" TEXT NOT NULL, "isPrimary" BOOLEAN NOT NULL DEFAULT false, "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "endedAt" TIMESTAMPTZ(3), "createdByUserId" TEXT NOT NULL, "updatedByUserId" TEXT NOT NULL, "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "CaseResponsibility_pkey" PRIMARY KEY ("id"), CONSTRAINT "CaseResponsibility_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "${schemaName}"."Case"("id") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ClientTag" ("clientId" TEXT NOT NULL, "tagId" TEXT NOT NULL, CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId", "tagId"), CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "${schemaName}"."Client"("id") ON DELETE CASCADE, CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "${schemaName}"."Tag"("id") ON DELETE CASCADE)`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."CaseTag" ("caseId" TEXT NOT NULL, "tagId" TEXT NOT NULL, CONSTRAINT "CaseTag_pkey" PRIMARY KEY ("caseId", "tagId"), CONSTRAINT "CaseTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "${schemaName}"."Case"("id") ON DELETE CASCADE, CONSTRAINT "CaseTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "${schemaName}"."Tag"("id") ON DELETE CASCADE)`,
      `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Client_primaryAddressId_fkey' AND connamespace = '${schemaName}'::regnamespace) THEN ALTER TABLE "${schemaName}"."Client" ADD CONSTRAINT "Client_primaryAddressId_fkey" FOREIGN KEY ("primaryAddressId") REFERENCES "${schemaName}"."ClientAddress"("id") ON DELETE SET NULL; END IF; END $$;`,
      `CREATE INDEX IF NOT EXISTS "Tag_workspaceId_isActive_name_idx" ON "${schemaName}"."Tag"("workspaceId", "isActive", "name")`,
      `CREATE INDEX IF NOT EXISTS "CaseType_workspaceId_isActive_name_idx" ON "${schemaName}"."CaseType"("workspaceId", "isActive", "name")`,
      `CREATE INDEX IF NOT EXISTS "PracticeArea_workspaceId_isActive_name_idx" ON "${schemaName}"."PracticeArea"("workspaceId", "isActive", "name")`,
      `CREATE INDEX IF NOT EXISTS "Client_workspaceId_status_displayName_idx" ON "${schemaName}"."Client"("workspaceId", "status", "displayName")`,
      `CREATE INDEX IF NOT EXISTS "Case_workspaceId_clientId_status_updatedAt_idx" ON "${schemaName}"."Case"("workspaceId", "clientId", "status", "updatedAt")`,
      `CREATE INDEX IF NOT EXISTS "CaseActivity_workspaceId_caseId_activityDate_idx" ON "${schemaName}"."CaseActivity"("workspaceId", "caseId", "activityDate")`,
      `CREATE INDEX IF NOT EXISTS "ClientActivity_workspaceId_clientId_activityDate_idx" ON "${schemaName}"."ClientActivity"("workspaceId", "clientId", "activityDate")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientAddress_one_primary_idx" ON "${schemaName}"."ClientAddress"("clientId") WHERE "isPrimary"`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "ClientContact_one_primary_active_idx" ON "${schemaName}"."ClientContact"("clientId") WHERE "isPrimary" AND "status" = 'ACTIVE'`,
      `CREATE UNIQUE INDEX IF NOT EXISTS "CaseResponsibility_one_primary_active_idx" ON "${schemaName}"."CaseResponsibility"("caseId") WHERE "isPrimary" AND "endedAt" IS NULL`,
    ];
    const statements = [
      `CREATE SCHEMA IF NOT EXISTS "${schemaName}"`,
      ...domainStatements,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'DateTimeFormatPreference' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."DateTimeFormatPreference" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'ChatSessionStatus' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."ChatSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'ChatMessageRole' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'ChatMessageStatus' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."ChatMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'TriageDecision' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."TriageDecision" AS ENUM ('LEGAL', 'NON_LEGAL', 'UNCLEAR');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'ChatAttachmentExtractionStatus' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."ChatAttachmentExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'ChatAttachmentSourceScript' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."ChatAttachmentSourceScript" AS ENUM ('LATIN', 'CYRILLIC', 'MIXED', 'NONE');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'WorkflowJobStatus' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."WorkflowJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE t.typname = 'DraftApprovalStatus' AND n.nspname = '${schemaName}') THEN
          CREATE TYPE "${schemaName}"."DraftApprovalStatus" AS ENUM ('DRAFT', 'READY_FOR_SIGNOFF', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');
        END IF;
      END $$;`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."WorkspaceConfig" (
        "workspaceId" TEXT NOT NULL,
        "timeZone" TEXT NOT NULL DEFAULT 'Europe/Belgrade',
        "dateTimeFormat" "${schemaName}"."DateTimeFormatPreference" NOT NULL DEFAULT 'TWENTY_FOUR_HOUR',
        "workspaceNotifications" BOOLEAN NOT NULL DEFAULT true,
        "officeHours" JSONB,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkspaceConfig_pkey" PRIMARY KEY ("workspaceId")
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'WorkspaceConfig' AND column_name = 'dateTimeFormat' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."WorkspaceConfig" ALTER COLUMN "dateTimeFormat" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."WorkspaceConfig" ALTER COLUMN "dateTimeFormat" TYPE "${schemaName}"."DateTimeFormatPreference" USING "dateTimeFormat"::"${schemaName}"."DateTimeFormatPreference";
          ALTER TABLE "${schemaName}"."WorkspaceConfig" ALTER COLUMN "dateTimeFormat" SET DEFAULT 'TWENTY_FOUR_HOUR';
        END IF;
      END $$;`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ChatSession" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "createdByUserId" TEXT NOT NULL,
        "title" TEXT,
        "status" "${schemaName}"."ChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
        "isDeleted" BOOLEAN NOT NULL DEFAULT false,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatSession' AND column_name = 'status' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatSession" ALTER COLUMN "status" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."ChatSession" ALTER COLUMN "status" TYPE "${schemaName}"."ChatSessionStatus" USING "status"::"${schemaName}"."ChatSessionStatus";
          ALTER TABLE "${schemaName}"."ChatSession" ALTER COLUMN "status" SET DEFAULT 'ACTIVE';
        END IF;
      END $$;`,
      `CREATE INDEX IF NOT EXISTS "ChatSession_workspaceId_updatedAt_idx" ON "${schemaName}"."ChatSession"("workspaceId", "updatedAt")`,
      `CREATE INDEX IF NOT EXISTS "ChatSession_createdByUserId_isDeleted_createdAt_idx" ON "${schemaName}"."ChatSession"("createdByUserId", "isDeleted", "createdAt")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ChatMessage" (
        "id" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "role" "${schemaName}"."ChatMessageRole" NOT NULL,
        "content" TEXT NOT NULL,
        "status" "${schemaName}"."ChatMessageStatus" NOT NULL DEFAULT 'COMPLETED',
        "triageDecision" "${schemaName}"."TriageDecision",
        "correlationId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "${schemaName}"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatMessage' AND column_name = 'role' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatMessage" ALTER COLUMN "role" TYPE "${schemaName}"."ChatMessageRole" USING "role"::"${schemaName}"."ChatMessageRole";
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatMessage' AND column_name = 'status' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatMessage" ALTER COLUMN "status" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."ChatMessage" ALTER COLUMN "status" TYPE "${schemaName}"."ChatMessageStatus" USING "status"::"${schemaName}"."ChatMessageStatus";
          ALTER TABLE "${schemaName}"."ChatMessage" ALTER COLUMN "status" SET DEFAULT 'COMPLETED';
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatMessage' AND column_name = 'triageDecision' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatMessage" ALTER COLUMN "triageDecision" TYPE "${schemaName}"."TriageDecision" USING "triageDecision"::"${schemaName}"."TriageDecision";
        END IF;
      END $$;`,
      `CREATE INDEX IF NOT EXISTS "ChatMessage_sessionId_createdAt_idx" ON "${schemaName}"."ChatMessage"("sessionId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "ChatMessage_correlationId_idx" ON "${schemaName}"."ChatMessage"("correlationId")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."ChatAttachment" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "messageId" TEXT,
        "originalName" TEXT NOT NULL,
        "storedName" TEXT NOT NULL,
        "mimeType" TEXT NOT NULL,
        "sizeBytes" INTEGER NOT NULL,
        "extractionStatus" "${schemaName}"."ChatAttachmentExtractionStatus" NOT NULL DEFAULT 'PENDING',
        "extractedText" TEXT,
        "sourceScript" "${schemaName}"."ChatAttachmentSourceScript",
        "extractionError" TEXT,
        "extractedAt" TIMESTAMPTZ(3),
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "ChatAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "${schemaName}"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "${schemaName}"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatAttachment' AND column_name = 'extractionStatus' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatAttachment" ALTER COLUMN "extractionStatus" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."ChatAttachment" ALTER COLUMN "extractionStatus" TYPE "${schemaName}"."ChatAttachmentExtractionStatus" USING "extractionStatus"::"${schemaName}"."ChatAttachmentExtractionStatus";
          ALTER TABLE "${schemaName}"."ChatAttachment" ALTER COLUMN "extractionStatus" SET DEFAULT 'PENDING';
        END IF;
      END $$;`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'ChatAttachment' AND column_name = 'sourceScript' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."ChatAttachment" ALTER COLUMN "sourceScript" TYPE "${schemaName}"."ChatAttachmentSourceScript" USING "sourceScript"::"${schemaName}"."ChatAttachmentSourceScript";
        END IF;
      END $$;`,
      `CREATE INDEX IF NOT EXISTS "ChatAttachment_workspaceId_sessionId_idx" ON "${schemaName}"."ChatAttachment"("workspaceId", "sessionId")`,
      `CREATE INDEX IF NOT EXISTS "ChatAttachment_messageId_idx" ON "${schemaName}"."ChatAttachment"("messageId")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."WorkflowJob" (
        "id" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "workflowName" TEXT NOT NULL,
        "status" "${schemaName}"."WorkflowJobStatus" NOT NULL DEFAULT 'QUEUED',
        "correlationId" TEXT NOT NULL,
        "input" JSONB,
        "output" JSONB,
        "errorCode" TEXT,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "WorkflowJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "${schemaName}"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'WorkflowJob' AND column_name = 'status' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."WorkflowJob" ALTER COLUMN "status" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."WorkflowJob" ALTER COLUMN "status" TYPE "${schemaName}"."WorkflowJobStatus" USING "status"::"${schemaName}"."WorkflowJobStatus";
          ALTER TABLE "${schemaName}"."WorkflowJob" ALTER COLUMN "status" SET DEFAULT 'QUEUED';
        END IF;
      END $$;`,
      `CREATE INDEX IF NOT EXISTS "WorkflowJob_workspaceId_createdAt_idx" ON "${schemaName}"."WorkflowJob"("workspaceId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "WorkflowJob_sessionId_createdAt_idx" ON "${schemaName}"."WorkflowJob"("sessionId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "WorkflowJob_correlationId_idx" ON "${schemaName}"."WorkflowJob"("correlationId")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."BriefExtractionResult" (
        "id" TEXT NOT NULL,
        "jobId" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "messageId" TEXT,
        "brief" JSONB NOT NULL,
        "confidence" DOUBLE PRECISION,
        "missingFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "promptChars" INTEGER NOT NULL,
        "truncated" BOOLEAN NOT NULL DEFAULT false,
        "model" TEXT NOT NULL,
        "errorCode" TEXT,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "BriefExtractionResult_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "BriefExtractionResult_jobId_key" UNIQUE ("jobId"),
        CONSTRAINT "BriefExtractionResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "${schemaName}"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BriefExtractionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "${schemaName}"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "BriefExtractionResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "${schemaName}"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS "BriefExtractionResult_workspaceId_createdAt_idx" ON "${schemaName}"."BriefExtractionResult"("workspaceId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "BriefExtractionResult_sessionId_createdAt_idx" ON "${schemaName}"."BriefExtractionResult"("sessionId", "createdAt")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."DraftResult" (
        "id" TEXT NOT NULL,
        "jobId" TEXT NOT NULL,
        "workspaceId" TEXT NOT NULL,
        "sessionId" TEXT NOT NULL,
        "messageId" TEXT,
        "briefResultId" TEXT,
        "documentText" TEXT NOT NULL,
        "finalDocumentText" TEXT,
        "warnings" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "promptChars" INTEGER NOT NULL,
        "truncated" BOOLEAN NOT NULL DEFAULT false,
        "model" TEXT NOT NULL,
        "approvalStatus" "${schemaName}"."DraftApprovalStatus" NOT NULL DEFAULT 'READY_FOR_SIGNOFF',
        "reviewedByUserId" TEXT,
        "reviewedAt" TIMESTAMPTZ(3),
        "reviewNote" TEXT,
        "previousDraftId" TEXT,
        "errorCode" TEXT,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "DraftResult_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "DraftResult_jobId_key" UNIQUE ("jobId"),
        CONSTRAINT "DraftResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "${schemaName}"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DraftResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "${schemaName}"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "DraftResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "${schemaName}"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "DraftResult_briefResultId_fkey" FOREIGN KEY ("briefResultId") REFERENCES "${schemaName}"."BriefExtractionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "DraftResult_previousDraftId_fkey" FOREIGN KEY ("previousDraftId") REFERENCES "${schemaName}"."DraftResult"("id") ON DELETE SET NULL ON UPDATE CASCADE
      )`,
      `DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = '${schemaName}' AND table_name = 'DraftResult' AND column_name = 'approvalStatus' AND udt_name = 'text') THEN
          ALTER TABLE "${schemaName}"."DraftResult" ALTER COLUMN "approvalStatus" DROP DEFAULT;
          ALTER TABLE "${schemaName}"."DraftResult" ALTER COLUMN "approvalStatus" TYPE "${schemaName}"."DraftApprovalStatus" USING "approvalStatus"::"${schemaName}"."DraftApprovalStatus";
          ALTER TABLE "${schemaName}"."DraftResult" ALTER COLUMN "approvalStatus" SET DEFAULT 'READY_FOR_SIGNOFF';
        END IF;
      END $$;`,
      `CREATE INDEX IF NOT EXISTS "DraftResult_workspaceId_createdAt_idx" ON "${schemaName}"."DraftResult"("workspaceId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "DraftResult_sessionId_createdAt_idx" ON "${schemaName}"."DraftResult"("sessionId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "DraftResult_approvalStatus_reviewedAt_idx" ON "${schemaName}"."DraftResult"("approvalStatus", "reviewedAt")`,
      `CREATE TABLE IF NOT EXISTS "${schemaName}"."TenantAuditEvent" (
        "id" TEXT NOT NULL,
        "userId" TEXT,
        "workspaceId" TEXT,
        "eventType" TEXT NOT NULL,
        "outcome" TEXT NOT NULL,
        "requestId" TEXT,
        "metadata" JSONB,
        "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "TenantAuditEvent_pkey" PRIMARY KEY ("id")
      )`,
      `CREATE INDEX IF NOT EXISTS "TenantAuditEvent_userId_createdAt_idx" ON "${schemaName}"."TenantAuditEvent"("userId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "TenantAuditEvent_workspaceId_createdAt_idx" ON "${schemaName}"."TenantAuditEvent"("workspaceId", "createdAt")`,
      `CREATE INDEX IF NOT EXISTS "TenantAuditEvent_eventType_createdAt_idx" ON "${schemaName}"."TenantAuditEvent"("eventType", "createdAt")`,
    ];

    const tenantPrisma = this.connectionManager.getTenantClient(
      tenantId,
      databaseName,
    );
    for (const sql of statements) {
      await tenantPrisma.$executeRawUnsafe(sql);
    }
    this.logger.log(`Tenant database "${databaseName}" provisioned successfully`);
  }
}
