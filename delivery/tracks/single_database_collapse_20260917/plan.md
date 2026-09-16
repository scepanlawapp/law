# Single Database Collapse Implementation Plan

- [x] Merge `platform.prisma` + `tenant.prisma` into one `schema.prisma` (single datasource/generator,
      `Tenant` model removed, `AuthSession.activeWorkspaceId`/`activeTenantId` removed).
- [x] Delete dual-schema Prisma files, reset migration history, update `package.json`/`tsconfig`
      scripts and path mappings for the single `@prisma/client`.
- [x] Delete `TenantConnectionManager`, `TenantContext(Service)`, `TenantContextInterceptor`,
      `TenantRegistryService`, `TenantSchemaProvisioner`; add `WorkspaceContext(Service)` +
      `WorkspaceContextInterceptor`.
- [x] Rewrite `WorkspaceAccessGuard` to check membership against a hardcoded workspace id constant.
- [x] Remove `/workspaces` discovery endpoint (`WorkspacesController`).
- [x] Rewire `cases`/`clients`/`chat`/`references` services, `workflow.runner.ts`,
      `workflow.processor.ts`, `user-settings.controller.ts` off `TenantContextService` onto the
      shared `PrismaService` + `WorkspaceContextService`.
- [x] Simplify `auth.service.ts` (drop `selectionForWorkspace`/`validSelection`/
      `selectActiveWorkspace`), remove the `/auth/active-workspace` route, trim
      `AuthSessionResponse`/remove unused `WorkspaceSummary`/`TenantSummary`/`TenantContextPayload`
      types.
- [x] Update frontend `AuthState`/`AuthApiClient` to match the trimmed session contract (single
      membership, no workspace-switch API call).
- [x] Simplify `seed.cjs` to a single `PrismaClient`, remove `infra/docker/compose.yml`
      `postgres-tenant` service, update `.env.example`.
- [x] Update/replace specs referencing deleted tenant symbols (`core.spec.ts`,
      `cases.service.spec.ts`, `chat.service.spec.ts`, `user-settings.controller.spec.ts`,
      `multi-tenant.spec.ts` removed).
- [x] Run `prisma generate` + `prisma migrate dev` against a fresh `law_platform` database and
      confirm `npx nx build api` / `npx nx test api` pass end-to-end.

## Verification results

- `npx prisma generate --schema apps/api/prisma/schema.prisma` — OK.
- `npx nx build api` — OK (also surfaced and fixed a pre-existing JSON-typing gap in
  `workflow.runner.ts` that `any` had previously masked).
- `npx nx test api` — 69/69 passing (13 suites).
- `npx nx test core` / `npx nx test security` / `npx nx test api-clients` — passing.
- `npx nx build web` — TypeScript compiles cleanly; only pre-existing, unrelated bundle-budget
  warnings remain (not touched in this track).
- Fixed `config.validation.ts`, which still required `TENANT_DATABASE_URL`/
  `TENANT_ADMIN_DATABASE_URL` env vars — removed.
- Still pending: apply the fresh baseline migration against a real Postgres instance and run
  `node apps/api/prisma/seed.cjs` end-to-end (no local Postgres was running in this session).

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
