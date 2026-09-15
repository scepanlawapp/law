# Changes

## Database

- Added Phase 04 enums and tenant models to `apps/api/prisma/tenant.prisma`.
- Added additive migration `20260915150000_documents_custom_fields_activity`.
- Applied the migration successfully to the local tenant database.
- Added idempotent extensibility DDL to `TenantSchemaProvisioner` through `extensibility-schema.ts`.

## Backend

- Added `libs/api/features/documents` with tenant-scoped upload, list, download, archive, Client/Matter linking, and ActivityEvent writes.
- Added legal document storage under tenant/workspace/document-specific paths without altering chat attachment paths.
- Registered the DocumentsModule and `@law/documents` alias.

## Deferred

- Custom-field service/controller and dynamic frontend renderer.
- Full Document and Activity Angular integrations.
