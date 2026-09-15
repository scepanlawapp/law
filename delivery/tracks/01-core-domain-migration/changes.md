# Changes

## Prisma and tenant database

- Added core legal enums and tenant models to `apps/api/prisma/tenant.prisma`.
- Added additive migration `20260915120000_core_legal_domain`.
- Applied the migration to the inspected local tenant database.

## Provisioning and seed

- Added `libs/api/core/src/lib/legal-schema.ts` with idempotent legal schema statements.
- Wired legal schema statements into `TenantSchemaProvisioner`.
- Added idempotent default lookup seeding to `apps/api/prisma/seed.cjs`.

## Compatibility

- Preserved existing chat/workflow/draft tables.
- Left historical migrations, stale shared contracts, stale API clients, and frontend placeholders unchanged.
- No legacy legal data was migrated because the inspected local tenant database contained no legacy legal tables or rows.
