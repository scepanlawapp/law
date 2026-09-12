# Platform Multi-Tenant Layer & Schema-per-Tenant Isolation

- **Track ID:** `platform_multi_tenant_layer_20260912`
- **Type:** Architecture
- **Status:** In Progress

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Track initialized. Scaffolding platform vs tenant schema separation, Tenant Manager, Tenant Context with `AsyncLocalStorage`, schema-per-tenant connection management, workspace discovery, and migrating existing business endpoints (chat) to the isolated tenant boundary.
