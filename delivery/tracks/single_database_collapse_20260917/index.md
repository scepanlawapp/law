# Single Database Collapse & Hardcoded Workspace

- **Track ID:** `single_database_collapse_20260917`
- **Type:** Architecture
- **Status:** In Progress

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)

## Current checkpoint

Merged `platform.prisma` + `tenant.prisma` into a single `schema.prisma` targeting one
`law_platform` database, removed the `Tenant` model and all tenant-DB machinery
(`TenantConnectionManager`, `TenantContext`, `TenantRegistryService`,
`TenantSchemaProvisioner`), replaced it with a lightweight `WorkspaceContext`, and hardcoded
`WorkspaceAccessGuard` to check membership against a single fixed workspace id. Removed the
`/workspaces` discovery endpoint and workspace/tenant selection from the auth session. Next:
run `prisma migrate dev` against a fresh `law_platform` database and verify the app end-to-end.
