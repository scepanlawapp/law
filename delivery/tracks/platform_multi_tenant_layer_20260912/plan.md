# Platform Multi-Tenant Layer Implementation Plan

- [ ] Dual Prisma schema configuration (`platform.prisma` and `tenant.prisma`) with dedicated client generators and schema provisioning.
- [ ] Platform database models (`Tenant`, `Workspace` tenant relationship) and migration execution.
- [ ] `TenantConnectionManager` with cached schema-bound Prisma clients and connection pooling.
- [ ] `TenantContext` definition and `TenantContextService` using Node.js `AsyncLocalStorage`.
- [ ] Workspace authorization integration: updating `WorkspaceAccessGuard` to resolve tenant and bind `TenantContext`.
- [ ] Workspace discovery API (`/workspaces`) for authenticated users.
- [ ] Business services migration: updating `ChatService`, `ChatStorageService`, and `WorkflowRunner` to consume `TenantContext`.
- [ ] Tenant data provisioning and migration script for initial workspace (`11111111-1111-4111-a111-111111111111`).
- [ ] Comprehensive automated test suite verifying auth, unauthorized workspace access, workspace switching, inactive status rejection, and cross-tenant isolation.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
