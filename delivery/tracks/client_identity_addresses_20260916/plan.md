# Client Identity and Addresses Implementation Plan

- [~] Update tenant Prisma Client, address, and identification-document models.
- [~] Add the existing-tenant migration with defaults, address backfill, pointer removal, and document table.
- [~] Align tenant schema provisioning and bootstrap seed with the new schema.
- [~] Extend client DTOs, service persistence, address behavior, and identification-document CRUD.
- [~] Update NestJS routes and shared API client/contracts.
- [ ] Add focused API tests for defaults, required addresses, primary-address enforcement, document CRUD, and workspace isolation.
- [ ] Run migration review, Prisma generation, API/web typechecks, and affected-project tests.

## Tenant Migration

Apply `apps/api/prisma/tenant-migrations/20260916010000_client_identity_addresses/migration.sql` with the target tenant database configured. New tenant databases receive the shape through `TenantSchemaProvisioner` and the bootstrap seed.

## Status Convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
