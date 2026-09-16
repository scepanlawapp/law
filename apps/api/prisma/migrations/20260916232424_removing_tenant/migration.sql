-- CreateEnum
CREATE TYPE "public"."UserStatus" AS ENUM ('INVITED', 'ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "public"."WorkspaceRole" AS ENUM ('OWNER', 'ADMIN', 'LAWYER', 'MEMBER');

-- CreateEnum
CREATE TYPE "public"."WorkspaceMemberStatus" AS ENUM ('INVITED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "public"."AuthTokenPurpose" AS ENUM ('INVITATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "public"."ChatSessionStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."ChatMessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."ChatMessageStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."TriageDecision" AS ENUM ('LEGAL', 'NON_LEGAL', 'UNCLEAR');

-- CreateEnum
CREATE TYPE "public"."ChatAttachmentExtractionStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'UNSUPPORTED');

-- CreateEnum
CREATE TYPE "public"."ChatAttachmentSourceScript" AS ENUM ('LATIN', 'CYRILLIC', 'MIXED', 'NONE');

-- CreateEnum
CREATE TYPE "public"."WorkflowJobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ThemePreference" AS ENUM ('MIDNIGHT', 'DEEP_NAVY', 'CHARCOAL', 'DARK_TEAL', 'BURGUNDY', 'IVORY');

-- CreateEnum
CREATE TYPE "public"."LanguagePreference" AS ENUM ('SR', 'EN');

-- CreateEnum
CREATE TYPE "public"."DateTimeFormatPreference" AS ENUM ('TWELVE_HOUR', 'TWENTY_FOUR_HOUR');

-- CreateEnum
CREATE TYPE "public"."DraftApprovalStatus" AS ENUM ('DRAFT', 'READY_FOR_SIGNOFF', 'APPROVED', 'REJECTED', 'CHANGES_REQUESTED');

-- CreateEnum
CREATE TYPE "public"."ClientType" AS ENUM ('INDIVIDUAL', 'ORGANIZATION');

-- CreateEnum
CREATE TYPE "public"."ClientStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ARCHIVED', 'PROSPECT');

-- CreateEnum
CREATE TYPE "public"."ClientContactStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "public"."ActivityType" AS ENUM ('NOTE', 'PHONE_CALL', 'MEETING', 'EMAIL', 'OTHER');

-- CreateEnum
CREATE TYPE "public"."ActivitySource" AS ENUM ('MANUAL', 'SYSTEM', 'AI');

-- CreateEnum
CREATE TYPE "public"."CaseStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."CasePriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "phone" TEXT,
    "jobTitle" TEXT,
    "avatarUrl" TEXT,
    "status" "public"."UserStatus" NOT NULL DEFAULT 'INVITED',
    "passwordChangedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserSettings" (
    "userId" TEXT NOT NULL,
    "theme" "public"."ThemePreference" NOT NULL DEFAULT 'CHARCOAL',
    "language" "public"."LanguagePreference" NOT NULL DEFAULT 'SR',
    "accentColor" TEXT NOT NULL DEFAULT 'GOLD',
    "finish" TEXT NOT NULL DEFAULT 'METALLIC',
    "workspaceNotifications" BOOLEAN NOT NULL DEFAULT true,
    "dateTimeFormat" "public"."DateTimeFormatPreference" NOT NULL DEFAULT 'TWENTY_FOUR_HOUR',
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Belgrade',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UserSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "public"."Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceConfig" (
    "workspaceId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'Europe/Belgrade',
    "dateTimeFormat" "public"."DateTimeFormatPreference" NOT NULL DEFAULT 'TWENTY_FOUR_HOUR',
    "workspaceNotifications" BOOLEAN NOT NULL DEFAULT true,
    "officeHours" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkspaceConfig_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "public"."DomainCounter" (
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DomainCounter_pkey" PRIMARY KEY ("workspaceId","name")
);

-- CreateTable
CREATE TABLE "public"."Tag" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CaseType" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaseType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PracticeArea" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "PracticeArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Client" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientNumber" TEXT NOT NULL,
    "type" "public"."ClientType" NOT NULL,
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "organizationName" TEXT,
    "isDomestic" BOOLEAN NOT NULL DEFAULT true,
    "jmbg" TEXT,
    "taxNumber" TEXT,
    "registrationNumber" TEXT,
    "status" "public"."ClientStatus" NOT NULL DEFAULT 'ACTIVE',
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "preferredLanguage" TEXT,
    "notes" TEXT,
    "customFields" JSONB,
    "responsibleUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientAddress" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "addressType" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "streetAdditional" TEXT,
    "city" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "stateOrRegion" TEXT,
    "country" TEXT NOT NULL,
    "note" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientIdentificationDocument" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "issuedDate" DATE,
    "expiredDate" DATE,
    "country" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientIdentificationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientContact" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "position" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "status" "public"."ClientContactStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "relatedCaseId" TEXT,
    "type" "public"."ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityDate" TIMESTAMPTZ(3) NOT NULL,
    "source" "public"."ActivitySource" NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ClientActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Case" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseNumber" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "caseTypeId" TEXT,
    "practiceAreaId" TEXT,
    "status" "public"."CaseStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "public"."CasePriority" NOT NULL DEFAULT 'NORMAL',
    "responsibleUserId" TEXT NOT NULL,
    "openedDate" TIMESTAMPTZ(3),
    "closedDate" TIMESTAMPTZ(3),
    "closingNote" TEXT,
    "externalReference" TEXT,
    "confidentialityLevel" TEXT,
    "customFields" JSONB,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CaseActivity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "type" "public"."ActivityType" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "activityDate" TIMESTAMPTZ(3) NOT NULL,
    "source" "public"."ActivitySource" NOT NULL DEFAULT 'MANUAL',
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaseActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."CaseResponsibility" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMPTZ(3),
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "CaseResponsibility_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ClientTag" (
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("clientId","tagId")
);

-- CreateTable
CREATE TABLE "public"."CaseTag" (
    "caseId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,

    CONSTRAINT "CaseTag_pkey" PRIMARY KEY ("caseId","tagId")
);

-- CreateTable
CREATE TABLE "public"."WorkspaceMember" (
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "role" "public"."WorkspaceRole" NOT NULL DEFAULT 'MEMBER',
    "status" "public"."WorkspaceMemberStatus" NOT NULL DEFAULT 'INVITED',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("userId","workspaceId")
);

-- CreateTable
CREATE TABLE "public"."AuthSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenFamily" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),
    "replacedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuthToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "purpose" "public"."AuthTokenPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "consumedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."AuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT,
    "status" "public"."ChatSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ChatSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatMessage" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" "public"."ChatMessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "public"."ChatMessageStatus" NOT NULL DEFAULT 'COMPLETED',
    "triageDecision" "public"."TriageDecision",
    "correlationId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ChatAttachment" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "messageId" TEXT,
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "extractionStatus" "public"."ChatAttachmentExtractionStatus" NOT NULL DEFAULT 'PENDING',
    "extractedText" TEXT,
    "sourceScript" "public"."ChatAttachmentSourceScript",
    "extractionError" TEXT,
    "extractedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."WorkflowJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workflowName" TEXT NOT NULL,
    "status" "public"."WorkflowJobStatus" NOT NULL DEFAULT 'QUEUED',
    "correlationId" TEXT NOT NULL,
    "input" JSONB,
    "output" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "WorkflowJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BriefExtractionResult" (
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

    CONSTRAINT "BriefExtractionResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DraftResult" (
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
    "approvalStatus" "public"."DraftApprovalStatus" NOT NULL DEFAULT 'READY_FOR_SIGNOFF',
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewNote" TEXT,
    "previousDraftId" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "DraftResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TenantAuditEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "workspaceId" TEXT,
    "eventType" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "requestId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantAuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "public"."User"("username");

-- CreateIndex
CREATE INDEX "Tag_workspaceId_isActive_name_idx" ON "public"."Tag"("workspaceId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Tag_workspaceId_name_key" ON "public"."Tag"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "CaseType_workspaceId_isActive_name_idx" ON "public"."CaseType"("workspaceId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CaseType_workspaceId_name_key" ON "public"."CaseType"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "PracticeArea_workspaceId_isActive_name_idx" ON "public"."PracticeArea"("workspaceId", "isActive", "name");

-- CreateIndex
CREATE UNIQUE INDEX "PracticeArea_workspaceId_name_key" ON "public"."PracticeArea"("workspaceId", "name");

-- CreateIndex
CREATE INDEX "Client_workspaceId_status_displayName_idx" ON "public"."Client"("workspaceId", "status", "displayName");

-- CreateIndex
CREATE INDEX "Client_workspaceId_type_status_idx" ON "public"."Client"("workspaceId", "type", "status");

-- CreateIndex
CREATE INDEX "Client_workspaceId_responsibleUserId_status_idx" ON "public"."Client"("workspaceId", "responsibleUserId", "status");

-- CreateIndex
CREATE INDEX "Client_workspaceId_email_idx" ON "public"."Client"("workspaceId", "email");

-- CreateIndex
CREATE INDEX "Client_workspaceId_phone_idx" ON "public"."Client"("workspaceId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Client_workspaceId_clientNumber_key" ON "public"."Client"("workspaceId", "clientNumber");

-- CreateIndex
CREATE INDEX "ClientAddress_clientId_createdAt_idx" ON "public"."ClientAddress"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientIdentificationDocument_clientId_createdAt_idx" ON "public"."ClientIdentificationDocument"("clientId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientContact_clientId_status_lastName_firstName_idx" ON "public"."ClientContact"("clientId", "status", "lastName", "firstName");

-- CreateIndex
CREATE INDEX "ClientActivity_workspaceId_clientId_activityDate_idx" ON "public"."ClientActivity"("workspaceId", "clientId", "activityDate");

-- CreateIndex
CREATE INDEX "ClientActivity_relatedCaseId_idx" ON "public"."ClientActivity"("relatedCaseId");

-- CreateIndex
CREATE INDEX "Case_workspaceId_clientId_status_updatedAt_idx" ON "public"."Case"("workspaceId", "clientId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Case_workspaceId_status_updatedAt_idx" ON "public"."Case"("workspaceId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "Case_workspaceId_responsibleUserId_status_idx" ON "public"."Case"("workspaceId", "responsibleUserId", "status");

-- CreateIndex
CREATE INDEX "Case_workspaceId_caseTypeId_status_idx" ON "public"."Case"("workspaceId", "caseTypeId", "status");

-- CreateIndex
CREATE INDEX "Case_workspaceId_practiceAreaId_status_idx" ON "public"."Case"("workspaceId", "practiceAreaId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Case_workspaceId_caseNumber_key" ON "public"."Case"("workspaceId", "caseNumber");

-- CreateIndex
CREATE INDEX "CaseActivity_workspaceId_caseId_activityDate_idx" ON "public"."CaseActivity"("workspaceId", "caseId", "activityDate");

-- CreateIndex
CREATE INDEX "CaseResponsibility_workspaceId_caseId_endedAt_idx" ON "public"."CaseResponsibility"("workspaceId", "caseId", "endedAt");

-- CreateIndex
CREATE INDEX "CaseResponsibility_workspaceId_userId_endedAt_idx" ON "public"."CaseResponsibility"("workspaceId", "userId", "endedAt");

-- CreateIndex
CREATE INDEX "ClientTag_tagId_clientId_idx" ON "public"."ClientTag"("tagId", "clientId");

-- CreateIndex
CREATE INDEX "CaseTag_tagId_caseId_idx" ON "public"."CaseTag"("tagId", "caseId");

-- CreateIndex
CREATE INDEX "WorkspaceMember_workspaceId_status_idx" ON "public"."WorkspaceMember"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "AuthSession_userId_revokedAt_idx" ON "public"."AuthSession"("userId", "revokedAt");

-- CreateIndex
CREATE INDEX "AuthSession_tokenFamily_idx" ON "public"."AuthSession"("tokenFamily");

-- CreateIndex
CREATE INDEX "AuthToken_purpose_tokenHash_idx" ON "public"."AuthToken"("purpose", "tokenHash");

-- CreateIndex
CREATE INDEX "AuthToken_userId_purpose_idx" ON "public"."AuthToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "AuditEvent_userId_createdAt_idx" ON "public"."AuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_workspaceId_createdAt_idx" ON "public"."AuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_eventType_createdAt_idx" ON "public"."AuditEvent"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ChatSession_workspaceId_updatedAt_idx" ON "public"."ChatSession"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatSession_createdByUserId_isDeleted_createdAt_idx" ON "public"."ChatSession"("createdByUserId", "isDeleted", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_sessionId_createdAt_idx" ON "public"."ChatMessage"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMessage_correlationId_idx" ON "public"."ChatMessage"("correlationId");

-- CreateIndex
CREATE INDEX "ChatAttachment_workspaceId_sessionId_idx" ON "public"."ChatAttachment"("workspaceId", "sessionId");

-- CreateIndex
CREATE INDEX "ChatAttachment_messageId_idx" ON "public"."ChatAttachment"("messageId");

-- CreateIndex
CREATE INDEX "WorkflowJob_workspaceId_createdAt_idx" ON "public"."WorkflowJob"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowJob_sessionId_createdAt_idx" ON "public"."WorkflowJob"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkflowJob_correlationId_idx" ON "public"."WorkflowJob"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "BriefExtractionResult_jobId_key" ON "public"."BriefExtractionResult"("jobId");

-- CreateIndex
CREATE INDEX "BriefExtractionResult_workspaceId_createdAt_idx" ON "public"."BriefExtractionResult"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "BriefExtractionResult_sessionId_createdAt_idx" ON "public"."BriefExtractionResult"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "DraftResult_jobId_key" ON "public"."DraftResult"("jobId");

-- CreateIndex
CREATE INDEX "DraftResult_workspaceId_createdAt_idx" ON "public"."DraftResult"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftResult_sessionId_createdAt_idx" ON "public"."DraftResult"("sessionId", "createdAt");

-- CreateIndex
CREATE INDEX "DraftResult_approvalStatus_reviewedAt_idx" ON "public"."DraftResult"("approvalStatus", "reviewedAt");

-- CreateIndex
CREATE INDEX "TenantAuditEvent_userId_createdAt_idx" ON "public"."TenantAuditEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantAuditEvent_workspaceId_createdAt_idx" ON "public"."TenantAuditEvent"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantAuditEvent_eventType_createdAt_idx" ON "public"."TenantAuditEvent"("eventType", "createdAt");

-- AddForeignKey
ALTER TABLE "public"."UserSettings" ADD CONSTRAINT "UserSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceConfig" ADD CONSTRAINT "WorkspaceConfig_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DomainCounter" ADD CONSTRAINT "DomainCounter_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseType" ADD CONSTRAINT "CaseType_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PracticeArea" ADD CONSTRAINT "PracticeArea_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Client" ADD CONSTRAINT "Client_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientAddress" ADD CONSTRAINT "ClientAddress_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientIdentificationDocument" ADD CONSTRAINT "ClientIdentificationDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientContact" ADD CONSTRAINT "ClientContact_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientActivity" ADD CONSTRAINT "ClientActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientActivity" ADD CONSTRAINT "ClientActivity_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientActivity" ADD CONSTRAINT "ClientActivity_relatedCaseId_fkey" FOREIGN KEY ("relatedCaseId") REFERENCES "public"."Case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Case" ADD CONSTRAINT "Case_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Case" ADD CONSTRAINT "Case_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Case" ADD CONSTRAINT "Case_caseTypeId_fkey" FOREIGN KEY ("caseTypeId") REFERENCES "public"."CaseType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Case" ADD CONSTRAINT "Case_practiceAreaId_fkey" FOREIGN KEY ("practiceAreaId") REFERENCES "public"."PracticeArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseActivity" ADD CONSTRAINT "CaseActivity_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseActivity" ADD CONSTRAINT "CaseActivity_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseResponsibility" ADD CONSTRAINT "CaseResponsibility_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseResponsibility" ADD CONSTRAINT "CaseResponsibility_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseTag" ADD CONSTRAINT "CaseTag_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CaseTag" ADD CONSTRAINT "CaseTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "public"."Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."AuditEvent" ADD CONSTRAINT "AuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatSession" ADD CONSTRAINT "ChatSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatMessage" ADD CONSTRAINT "ChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ChatAttachment" ADD CONSTRAINT "ChatAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowJob" ADD CONSTRAINT "WorkflowJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."WorkflowJob" ADD CONSTRAINT "WorkflowJob_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BriefExtractionResult" ADD CONSTRAINT "BriefExtractionResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."WorkflowJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "public"."ChatSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "public"."ChatMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_briefResultId_fkey" FOREIGN KEY ("briefResultId") REFERENCES "public"."BriefExtractionResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DraftResult" ADD CONSTRAINT "DraftResult_previousDraftId_fkey" FOREIGN KEY ("previousDraftId") REFERENCES "public"."DraftResult"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantAuditEvent" ADD CONSTRAINT "TenantAuditEvent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
