# Platform Multi-Tenant Layer & Schema-per-Tenant Isolation Specification

## 1. Context & Motivation

The system is evolving from a single-database structure to a multi-tenant legal platform. To provide strict data isolation across law firms while maintaining a shared platform for authentication and workspace management:

- Shared platform data (users, auth sessions, credentials, tokens, platform audit events, workspaces, memberships, and tenant registry) resides in the shared Platform layer (`public` PostgreSQL schema).
- Tenant business data (conversations, messages, attachments, AI jobs, brief extractions, draft results, tenant audit events, and firm configuration) resides in an isolated tenant schema (`tenant_<tenant_id>`) per law firm.
- File and document storage enforces strict directory isolation under `tenants/<tenant_id>/...`.
- User UI preferences (`UserSettings`) remain platform-wide, whereas law-firm configuration (`WorkspaceConfig`) is tenant-scoped.

## 2. Target Request Flow

```text
API Request → AuthGuard → WorkspaceAccessGuard → TenantManager → TenantContext → Business Service
```

1. **Authentication (`AuthGuard`):** Identifies the global user from HttpOnly session cookies via the platform database.
2. **Workspace Authorization (`WorkspaceAccessGuard`):** Reads target `X-Workspace-Id` header (or request property), validates active membership and role in the platform database.
3. **Tenant Resolution (`TenantManager`):** Resolves `Workspace → Tenant` mapping, verifies tenant status is `ACTIVE`, and retrieves the tenant schema name (`tenant_<id>`).
4. **Tenant Context (`TenantContext`):** Request-scoped context managed via Node.js `AsyncLocalStorage` providing `tenantId`, `workspaceId`, `userId`, `role`, schema-bound Prisma client, and isolated storage handles.
5. **Business Services:** Execute operations using `TenantContext.prisma` without receiving raw client tenant parameters or crossing schema boundaries.

## 3. Platform & Tenant Invariants

- Passwords and auth tokens are hashed and stored exclusively in the Platform database (`public` schema). They are never duplicated into tenant schemas.
- Downstream business services must never independently resolve tenants or trust a client-supplied `tenantId` or `schemaName`.
- Tenant schemas are isolated at the database level (`search_path = "tenant_<id>, public"` or schema qualification).
- Ordinary database foreign keys do not connect platform and tenant tables across schemas; user IDs in tenant schemas are scalar references (`createdByUserId`, `reviewedByUserId`) validated via `TenantContext`.
- Registration, login, password reset, `/auth/me`, and `/workspaces` are platform operations that do not require tenant context.
