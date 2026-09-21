-- CreateEnum
CREATE TYPE "public"."StorageProviderType" AS ENUM ('LOCAL');

-- CreateEnum
CREATE TYPE "public"."StoredFileLifecycle" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "public"."FileLocationState" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."UploadOperationStatus" AS ENUM ('ACCEPTED', 'WRITING', 'FINALIZING', 'COMMITTED', 'FAILED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "public"."UploadOperationPurpose" AS ENUM ('CREATE_DOCUMENT', 'ADD_VERSION');

-- CreateTable
CREATE TABLE "public"."StorageConnection" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "providerType" "public"."StorageProviderType" NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "configRef" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "StorageConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StoredFile" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "lifecycle" "public"."StoredFileLifecycle" NOT NULL DEFAULT 'PENDING',
    "detectedMimeType" TEXT,
    "sizeBytes" BIGINT NOT NULL DEFAULT 0,
    "sha256" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ(3),

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."FileLocation" (
    "id" TEXT NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storageConnectionId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "state" "public"."FileLocationState" NOT NULL DEFAULT 'PENDING',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "verifiedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FileLocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Document" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "currentVersionId" TEXT,
    "archivedAt" TIMESTAMPTZ(3),
    "archivedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DocumentCase" (
    "documentId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "DocumentCase_pkey" PRIMARY KEY ("documentId","caseId")
);

-- CreateTable
CREATE TABLE "public"."DocumentClient" (
    "documentId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,

    CONSTRAINT "DocumentClient_pkey" PRIMARY KEY ("documentId","clientId")
);

-- CreateTable
CREATE TABLE "public"."DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "storedFileId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UploadOperation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "purpose" "public"."UploadOperationPurpose" NOT NULL,
    "status" "public"."UploadOperationStatus" NOT NULL DEFAULT 'ACCEPTED',
    "requestFingerprint" TEXT NOT NULL,
    "documentId" TEXT,
    "documentVersionId" TEXT,
    "storedFileId" TEXT NOT NULL,
    "fileLocationId" TEXT NOT NULL,
    "storageConnectionId" TEXT NOT NULL,
    "errorCode" TEXT,
    "lastHeartbeatAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "UploadOperation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StorageConnection_workspaceId_configRef_key" ON "public"."StorageConnection"("workspaceId", "configRef");

-- CreateIndex
CREATE INDEX "StorageConnection_workspaceId_isDefault_enabled_idx" ON "public"."StorageConnection"("workspaceId", "isDefault", "enabled");

-- One default connection per workspace
CREATE UNIQUE INDEX "StorageConnection_workspace_default_uq" ON "public"."StorageConnection"("workspaceId") WHERE "isDefault" = true;

-- CreateIndex
CREATE INDEX "StoredFile_workspaceId_lifecycle_idx" ON "public"."StoredFile"("workspaceId", "lifecycle");

-- CreateIndex
CREATE UNIQUE INDEX "FileLocation_storageConnectionId_storageKey_key" ON "public"."FileLocation"("storageConnectionId", "storageKey");

-- CreateIndex
CREATE INDEX "FileLocation_storedFileId_isActive_idx" ON "public"."FileLocation"("storedFileId", "isActive");

-- CreateIndex
CREATE INDEX "FileLocation_workspaceId_idx" ON "public"."FileLocation"("workspaceId");

-- At most one active location per stored file
CREATE UNIQUE INDEX "FileLocation_storedFile_active_uq" ON "public"."FileLocation"("storedFileId") WHERE "isActive" = true;

-- CreateIndex
CREATE UNIQUE INDEX "Document_currentVersionId_key" ON "public"."Document"("currentVersionId");

-- CreateIndex
CREATE INDEX "Document_workspaceId_archivedAt_updatedAt_idx" ON "public"."Document"("workspaceId", "archivedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "Document_workspaceId_title_idx" ON "public"."Document"("workspaceId", "title");

-- CreateIndex
CREATE INDEX "DocumentCase_workspaceId_caseId_idx" ON "public"."DocumentCase"("workspaceId", "caseId");

-- CreateIndex
CREATE INDEX "DocumentCase_caseId_idx" ON "public"."DocumentCase"("caseId");

-- CreateIndex
CREATE INDEX "DocumentClient_workspaceId_clientId_idx" ON "public"."DocumentClient"("workspaceId", "clientId");

-- CreateIndex
CREATE INDEX "DocumentClient_clientId_idx" ON "public"."DocumentClient"("clientId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_versionNumber_key" ON "public"."DocumentVersion"("documentId", "versionNumber");

-- CreateIndex
CREATE INDEX "DocumentVersion_workspaceId_documentId_createdAt_idx" ON "public"."DocumentVersion"("workspaceId", "documentId", "createdAt");

-- CreateIndex
CREATE INDEX "DocumentVersion_storedFileId_idx" ON "public"."DocumentVersion"("storedFileId");

-- CreateIndex
CREATE UNIQUE INDEX "UploadOperation_workspaceId_idempotencyKey_key" ON "public"."UploadOperation"("workspaceId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "UploadOperation_workspaceId_status_lastHeartbeatAt_idx" ON "public"."UploadOperation"("workspaceId", "status", "lastHeartbeatAt");

-- CreateIndex
CREATE INDEX "UploadOperation_storedFileId_idx" ON "public"."UploadOperation"("storedFileId");

-- AddForeignKey
ALTER TABLE "public"."StorageConnection" ADD CONSTRAINT "StorageConnection_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StoredFile" ADD CONSTRAINT "StoredFile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FileLocation" ADD CONSTRAINT "FileLocation_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "public"."StoredFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FileLocation" ADD CONSTRAINT "FileLocation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."FileLocation" ADD CONSTRAINT "FileLocation_storageConnectionId_fkey" FOREIGN KEY ("storageConnectionId") REFERENCES "public"."StorageConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_archivedByUserId_fkey" FOREIGN KEY ("archivedByUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentCase" ADD CONSTRAINT "DocumentCase_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentCase" ADD CONSTRAINT "DocumentCase_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "public"."Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentCase" ADD CONSTRAINT "DocumentCase_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentClient" ADD CONSTRAINT "DocumentClient_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentClient" ADD CONSTRAINT "DocumentClient_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "public"."Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentClient" ADD CONSTRAINT "DocumentClient_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "public"."StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DocumentVersion" ADD CONSTRAINT "DocumentVersion_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Current version must exist; same-document ownership is enforced in the application transaction
ALTER TABLE "public"."Document" ADD CONSTRAINT "Document_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "public"."DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "public"."DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_storedFileId_fkey" FOREIGN KEY ("storedFileId") REFERENCES "public"."StoredFile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_fileLocationId_fkey" FOREIGN KEY ("fileLocationId") REFERENCES "public"."FileLocation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UploadOperation" ADD CONSTRAINT "UploadOperation_storageConnectionId_fkey" FOREIGN KEY ("storageConnectionId") REFERENCES "public"."StorageConnection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Provision a LOCAL default connection for every existing workspace
INSERT INTO "public"."StorageConnection" (
    "id",
    "workspaceId",
    "providerType",
    "enabled",
    "isDefault",
    "configRef",
    "createdAt",
    "updatedAt"
)
SELECT
    gen_random_uuid()::text,
    w."id",
    'LOCAL',
    true,
    true,
    'local-default',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "public"."Workspace" w
WHERE NOT EXISTS (
    SELECT 1
    FROM "public"."StorageConnection" sc
    WHERE sc."workspaceId" = w."id"
      AND sc."configRef" = 'local-default'
);
