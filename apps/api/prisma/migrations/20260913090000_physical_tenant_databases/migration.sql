-- Transitional platform migration for database-per-tenant isolation.
-- `schemaName` remains populated during the data-copy cutover and is removed only
-- after all tenant schemas have been migrated to their physical databases.

ALTER TABLE "public"."Tenant"
  ADD COLUMN "databaseName" TEXT;

ALTER TABLE "public"."Tenant"
  ALTER COLUMN "schemaName" DROP NOT NULL;

ALTER TABLE "public"."AuthSession"
  ADD COLUMN "activeWorkspaceId" TEXT,
  ADD COLUMN "activeTenantId" TEXT;

CREATE UNIQUE INDEX "Tenant_databaseName_key"
  ON "public"."Tenant"("databaseName");
CREATE INDEX "AuthSession_activeWorkspaceId_idx"
  ON "public"."AuthSession"("activeWorkspaceId");
CREATE INDEX "AuthSession_activeTenantId_idx"
  ON "public"."AuthSession"("activeTenantId");

ALTER TABLE "public"."AuthSession"
  ADD CONSTRAINT "AuthSession_activeWorkspaceId_fkey"
  FOREIGN KEY ("activeWorkspaceId") REFERENCES "public"."Workspace"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "public"."AuthSession"
  ADD CONSTRAINT "AuthSession_activeTenantId_fkey"
  FOREIGN KEY ("activeTenantId") REFERENCES "public"."Tenant"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;