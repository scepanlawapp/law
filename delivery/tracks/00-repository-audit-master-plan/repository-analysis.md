# Repository Analysis

## Workspace map

The repository is an Nx monorepo with deployable applications in `apps/` and shared/backend libraries in `libs/`.

### Applications

- `apps/api`: NestJS composition root, configuration, tests, Prisma ownership, seeds, and migrations.
- `apps/web`: Angular 22 standalone application with authenticated routing and feature screens.
- `apps/api-e2e`: Jest-based API end-to-end project.
- `apps/web-e2e`: Playwright project shell with no configured targets currently.

### Backend libraries

- `libs/api/core`: platform Prisma, tenant context, tenant connection management, workspace access guard, pagination, tenant provisioning.
- `libs/api/features/auth`: session authentication, CSRF, rate limiting, invitations, password flows.
- `libs/api/features/chat`: chat sessions, attachments, SSE, workflows, drafting, and local storage.
- `libs/api/features/references`: current users/countries and partial legacy reference endpoints.
- `libs/api/features/user-settings`: user profile and appearance/settings APIs.
- `libs/api/api-interfaces`: shared TypeScript contracts.
- `libs/api/ai/*`: AI contracts, providers, workflows, document utilities, extraction, retrieval, and transliteration.

### Frontend libraries

- `libs/shared/frontend/api-clients`: Angular HttpClient wrappers, including stale Client and Case clients.
- `libs/shared/frontend/security`: AuthState, auth interceptor, and route guard.
- `libs/shared/frontend/ui/*`: in-repository Spartan Helm components such as button, dialog, field, input, select, table, tabs, and related primitives.
- `libs/shared/ts`: shared TypeScript utilities.

## Current request and security flow

1. Angular requests use `AuthState` and the auth interceptor with credentialed requests.
2. Nest `AuthGuard` resolves the session from the cookie.
3. `WorkspaceAccessGuard` validates active workspace membership and resolves the tenant from platform Prisma.
4. `TenantContextInterceptor` binds tenant context through AsyncLocalStorage.
5. Tenant feature services access the tenant Prisma client through `TenantContextService.required.prisma`.
6. Existing chat services scope object queries by workspace ID and use safe not-found responses.

Legal features must preserve this flow and add domain-specific ownership checks for every referenced ID.

## Current persistence boundaries

- `apps/api/prisma/platform.prisma` contains users, workspaces, membership, sessions, tenants, settings, and platform audit events.
- `apps/api/prisma/tenant.prisma` contains tenant-side workspace configuration, chat/workflow/draft data, and `TenantAuditEvent`.
- Tenant data is physically isolated by database through `TenantConnectionManager`.
- `TenantSchemaProvisioner` and `seed.cjs` contain hand-written schema provisioning logic that must stay in parity with tenant Prisma and future legal migrations.

No current tenant model represents Party, Client, Case/Matter, Proceeding, Document, configurable legal lookup, typed custom field, relationship, or domain ActivityEvent.

## Current frontend boundaries

`apps/web/src/app/app.routes.ts` directly registers the authenticated dashboard, clients, cases, documents, calendar, finance, reports, tasks/deadlines, settings, and assistant screens. The Client, Case, and Document components are placeholders. Existing application patterns provide:

- standalone Angular components;
- signals and computed state;
- typed Reactive Forms;
- `LocalizationService` and `TranslatePipe`;
- `ToastService` and `ConfirmDialogService`;
- Spartan Helm/Brain components and Lucide icons;
- semantic token styling.

The legal UI should extend these patterns locally and avoid inventing a separate state architecture.

## Current contracts and stale surfaces

`api-interfaces.ts` contains legacy types such as `ClientType`, `ClientStatus`, `CaseStatus`, `CaseSummary`, `CaseDetail`, and request shapes. The Case request requires one `clientId`, which conflicts with the target MatterClient many-to-many model. The frontend API-client library exposes endpoints for `/clients`, `/cases`, contacts, addresses, activities, responsibilities, tags, case types, and practice areas, but no corresponding backend source currently exists.

`tsconfig.base.json` contains `@law/clients` and `@law/cases` aliases even though the target `src/index.ts` files are absent. These are stale compatibility artifacts and should be reconciled in Phase 02/03, not silently removed during the audit.

## Legal-domain gap matrix

| Target | Evidence in current checkout | Decision |
|---|---|---|
| Party | None | Add |
| PartyContactPoint | None; legacy Client email/phone contracts only | Add and migrate conceptually |
| PartyIdentifier | None | Add |
| PartyAddress | Legacy API-client shape only | Add and migrate conceptually |
| PartyRelationship | None | Add |
| Client | Legacy contracts/API client only; no backend/schema | Add |
| Configurable legal lookups | Partial legacy references for tags/case types/practice areas | Replace/extend with target lookup model |
| Matter | None; legacy Case terminology only | Add |
| MatterClient | None | Add |
| MatterParticipant and roles | None | Add |
| Proceeding | None | Add |
| Document links | Chat attachment only, no legal links | Add |
| Custom fields | Legacy response JSON fields only | Add typed subsystem |
| ActivityEvent | Platform/tenant audit only | Add legal activity model |

## Migration classification

- Existing platform authentication, workspace, tenant registry, tenant connection, and chat data: **keep and extend carefully**.
- Existing chat storage: **keep for chat compatibility; extract or adapt a general storage boundary later**.
- Existing legacy Client/Case contracts and API clients: **temporarily deprecate and reconcile**.
- Empty tenant Client/Case migration directory: **replace with reviewed, additive migration artifacts**; do not assume it migrated data.
- Legacy Case/Client domain schema: **not present in the current checkout; inspect actual deployed tenant databases before classifying data for migration**.
- Historical Prisma migrations: **keep unchanged**.
- Any future legacy legal tables after runtime cutover: **remove only after Phase 05 verification and backup**.

## Ambiguities requiring database inspection

- Whether any deployed tenant database contains the removed Client/Case schema.
- Whether the empty tenant migration directory reflects an unapplied migration, a deleted implementation, or a zero-data development baseline.
- Exact legacy column meanings for court, judge, external reference, case type, contacts, addresses, tags, and custom fields.
- Whether any existing stored files outside chat attachments should become legal Documents.
- Whether workspace IDs and tenant IDs are consistent across all deployed tenant databases.

No placeholder values should be inserted to resolve these questions.

## Search and indexing direction

Start with PostgreSQL indexes and tenant-scoped queries. Client search must include Party display fields, client code, direct contact points, identifiers, and organization contact-person values. Matter search must include internal number, title, and Client display name. Do not introduce Elasticsearch without measured requirements and explicit approval.

## Required negative security tests

- Tenant A cannot load or mutate Tenant B Client, Party, Matter, Proceeding, Document, lookup, custom-field, or ActivityEvent data.
- Tenant A cannot attach Tenant B Client, Party, User, lookup, or Document IDs to a local record.
- Tenant A cannot discover Tenant B entities through search or autocomplete.
- Unauthorized workspace roles cannot perform restricted lookup, lifecycle, document, or relationship operations.
- Storage keys and downloads remain tenant-scoped.

## Repository hygiene issues

- Prompt-required legal-domain filenames do not match the recovered files because of `(1)` and `(2)` suffixes.
- Client/Case delivery tracks claim implementation progress, but their metadata remains `in_progress` and the current source is absent.
- `apps/api/prisma/migrations/20260912154850_` contains a destructive migration history that should be treated as a warning for future additive migration review.
- `apps/web-e2e` has no configured targets.
- `@law/clients` and `@law/cases` path aliases point to missing source.
