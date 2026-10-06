CREATE TABLE "DocumentFolder" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DocumentFolder_valid_name" CHECK (length("name") BETWEEN 1 AND 255 AND "name" NOT IN ('.', '..') AND "name" !~ '[/\\]')
);
CREATE UNIQUE INDEX "DocumentFolder_id_workspaceId_key" ON "DocumentFolder"("id", "workspaceId");
CREATE UNIQUE INDEX "DocumentFolder_workspaceId_parentId_name_key" ON "DocumentFolder"("workspaceId", "parentId", "name") NULLS NOT DISTINCT;
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "DocumentFolder" ADD CONSTRAINT "DocumentFolder_parentId_workspaceId_fkey" FOREIGN KEY ("parentId", "workspaceId") REFERENCES "DocumentFolder"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "Document" ADD COLUMN "folderId" TEXT;
CREATE INDEX "Document_workspaceId_folderId_idx" ON "Document"("workspaceId", "folderId");
ALTER TABLE "Document" ADD CONSTRAINT "Document_folderId_workspaceId_fkey" FOREIGN KEY ("folderId", "workspaceId") REFERENCES "DocumentFolder"("id", "workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT;
