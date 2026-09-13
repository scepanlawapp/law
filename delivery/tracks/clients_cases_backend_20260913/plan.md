# Clients and Cases Backend Implementation Plan

- [x] Tenant Prisma models, constraints, number counter foundation, and tenant migration artifact.
- [x] Tenant schema provisioner and bootstrap seed parity with the new domain schema.
- [x] Shared client/case/reference contracts and validated DTOs.
- [x] Client APIs: CRUD, archive/activate, addresses, contacts, cases, and activities.
- [x] Case APIs: CRUD, explicit lifecycle actions, activities, and responsibilities.
- [x] Tenant-admin reference APIs: tags, case types, and practice areas; scoped user and country lists.
- [x] Focused workspace-isolation and lifecycle tests; database-backed primary-invariant and activity-generation integration coverage remains a release follow-up.
- [x] Prisma validation/generation and focused API test/build checks.

## Tenant Migration

For an existing tenant schema, run `npm run db:migrate:tenant` with `DATABASE_URL` or `TENANT_DATABASE_URL` set to that tenant schema. New tenant schemas receive the same domain tables and partial indexes through `TenantSchemaProvisioner`.

## Status Convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
