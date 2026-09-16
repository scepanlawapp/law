# Single Database Collapse & Hardcoded Workspace Specification

## 1. Context & Motivation

The previous architecture split data across a "platform" database (users, auth, workspaces,
tenant registry) and one physical `law_tenant_<id>` database per workspace, coordinated through
`TenantConnectionManager`/`TenantContext`/`TenantRegistryService`. This added operational
complexity (dual Prisma schemas, cross-database provisioning, per-request tenant resolution) that
is unnecessary for a single-firm deployment.

This track collapses the system back to **one PostgreSQL database (`law_platform`)** and **one
hardcoded workspace** (`11111111-1111-4111-a111-111111111111`), while keeping the
`Workspace`/`WorkspaceMember` model and the `WorkspaceAccessGuard` membership check intact so the
authorization shape (and all downstream `workspaceId`-scoped queries) stay unchanged.

## 2. Target Request Flow

```text
API Request → AuthGuard → WorkspaceAccessGuard (checks membership in the hardcoded workspace)
            → WorkspaceContext (AsyncLocalStorage: userId, workspaceId, role)
            → Business Service (uses the single shared PrismaService)
```

## 3. Invariants

- Exactly one Prisma schema (`apps/api/prisma/schema.prisma`), one datasource, one generated
  client (`@prisma/client`).
- No workspace switching: no `/workspaces` endpoint, no `X-Workspace-Id` header, no
  `activeWorkspaceId`/`activeTenantId` on `AuthSession` or `AuthSessionResponse`.
- `WorkspaceAccessGuard` is the single place the hardcoded workspace id is referenced
  (`libs/api/core/src/lib/workspace.constants.ts`); it still verifies the caller has an `ACTIVE`
  `WorkspaceMember` row for that workspace before allowing the request through.
- Business services no longer resolve a per-tenant Prisma client; they use the shared
  `PlatformPrismaService`/`PrismaService` directly, filtering all queries by
  `WorkspaceContextService.required.workspaceId` exactly as before.
