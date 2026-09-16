# Platform Multi-Tenant Layer & Schema-per-Tenant Isolation

- **Track ID:** `platform_multi_tenant_layer_20260912`
- **Type:** Architecture
- **Status:** Superseded — see [single_database_collapse_20260917](../single_database_collapse_20260917/index.md)

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Reverted 2026-09-17: the platform/tenant database-per-tenant split was collapsed back into a
single `law_platform` database with a hardcoded workspace. See the successor track for details.
