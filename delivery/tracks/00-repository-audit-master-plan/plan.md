# Phase 00: Repository Audit and Master Implementation Plan

## Objective

Create a repository-specific plan for rebuilding the legal management domain on the current checkout. This phase audits the repository and records the implementation sequence. It does not modify runtime application code.

## Authority and baseline

- The current checkout is authoritative.
- The Client/Case implementation was intentionally removed before this phase, so historical delivery notes are not treated as implemented source.
- The legal-domain specification exists with recovered filenames containing `(1)` and `(2)` suffixes. The prompt's unsuffixed paths do not exist in the current checkout.
- Repository mechanics come from the existing Nx, Angular, NestJS, Prisma, and Spartan/UI implementation.

## In scope

- Audit Nx apps and libraries, feature boundaries, routing, UI primitives, API patterns, Prisma schemas, migrations, seeds, storage, contracts, tests, and delivery artifacts.
- Record the Party/Client/Matter/Proceeding/Document/lookup/custom-field/activity gap analysis.
- Define a safe expand-and-contract migration and implementation sequence.
- Identify stale contracts, aliases, empty migration artifacts, and compatibility risks.
- Establish testing, verification, tenant-isolation, authorization, rollback, and data-safety requirements for later phases.
- Create `repository-analysis.md` and maintain the required Phase 00 delivery files.

## Out of scope

- No runtime application changes.
- No Prisma schema or migration SQL changes.
- No generated Prisma clients.
- No API, shared-contract, API-client, Angular, or test implementation.
- No restoration of the removed Client/Case implementation wholesale.
- No destructive legacy cleanup.
- No new ORM, search engine, UI library, AI persistence model, finance, tasks, calendar, portal, or court integration work.

## Confirmed repository findings

- Deployable projects are `apps/api`, `apps/web`, `apps/api-e2e`, and `apps/web-e2e`.
- `apps/api/src/app/app.module.ts` composes auth, chat, references, user settings, and core modules.
- Tenant isolation is database-per-tenant. `TenantContextService`, `WorkspaceAccessGuard`, `TenantRegistryService`, and `TenantConnectionManager` establish the authenticated tenant context.
- `apps/api/prisma/tenant.prisma` currently contains workspace configuration, chat/workflow/draft tables, and tenant audit data, but no legal-domain tables.
- `apps/api/prisma/tenant-migrations/20260913000000_clients_cases/` exists but is empty.
- `libs/api/api-interfaces/src/lib/api-interfaces.ts` still contains stale Client/Case contracts, including a single `clientId` Case shape and legacy contact/address structures.
- `libs/shared/frontend/api-clients/src/lib/api-clients.ts` still exposes Client and Case API clients even though corresponding backend source is absent.
- `tsconfig.base.json` contains `@law/clients` and `@law/cases` aliases whose target source files are absent.
- `/clients`, `/cases`, and `/documents` Angular routes exist, but the corresponding screens are placeholders.
- Existing reusable patterns include standalone Angular components, signals, typed Reactive Forms, localization, toast and confirmation services, Spartan Helm/Brain components, guarded Nest controllers, DTO validation, tenant Prisma access, and shared pagination helpers.
- Existing legal-domain backend, frontend, and e2e tests are absent.
- Chat attachment storage exists, but a general document metadata/link abstraction does not.
- Platform `AuditEvent` and tenant `TenantAuditEvent` exist; legal ActivityEvent remains to be added.

## Gap analysis

| Concept                                                                                                    | Current state                       | Planned treatment                                      |
| ---------------------------------------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------------------------ |
| Party                                                                                                      | Missing                             | Add as identity root with PERSON/ORGANIZATION          |
| PartyContactPoint                                                                                          | Missing                             | Add repeatable contact records                         |
| PartyIdentifier                                                                                            | Missing                             | Add generic typed identifiers                          |
| PartyAddress                                                                                               | Missing                             | Add multiple typed addresses                           |
| PartyRelationship                                                                                          | Missing                             | Add organization/person relationships                  |
| Client                                                                                                     | Stale contracts only                | Add business relationship to Party                     |
| PracticeArea, MatterStage, ParticipantRole, ProceedingType, DocumentCategory, OrganizationRelationshipType | Missing                             | Add tenant-configurable lookup records                 |
| Matter                                                                                                     | Missing; legacy Case contracts only | Add internal matter with DRAFT/OPEN/CLOSED lifecycle   |
| MatterClient                                                                                               | Missing                             | Add many-to-many relation with primary invariant       |
| MatterParticipant + roles                                                                                  | Missing                             | Add generic Party participation and configurable roles |
| Proceeding                                                                                                 | Missing                             | Add separate formal proceeding entity                  |
| Document links                                                                                             | Missing                             | Add one Document record and entity link tables         |
| Custom fields                                                                                              | Missing                             | Add typed definitions, options, and values             |
| ActivityEvent                                                                                              | Missing                             | Add backend-created tenant activity timeline           |

## Master implementation phases

### Phase 01: Core schema and safe migration

Add tenant Prisma models, system enums, lookup models, number allocation, foreign keys, tenant-scoped uniqueness, primary relationship invariants, seed defaults, tenant-schema provisioner parity, and additive migration artifacts. Inspect actual tenant databases before defining backfills. Preserve ambiguous legacy values rather than inventing placeholders.

### Phase 02: Shared contracts and NestJS APIs

Create modular shared contracts and real backend feature libraries. Implement mappers, validated DTOs, tenant-scoped CRUD, lifecycle actions, relationships, lookup management/deactivation, pagination, search/autocomplete, and security-negative tests. Do not expose Prisma types.

### Phase 03: Angular Client and Matter workflows

Replace placeholders with routed list/create/edit/detail screens. Reconcile stale API clients and contracts. Use typed forms, signals, localization, Spartan controls, server-side pagination/search, Client/Party/User autocomplete, Matter multi-client autocomplete, searchable configurable lookups, inline lookup creation, toast feedback, and confirmation dialogs.

### Phase 04: Documents, custom fields, and activity

Add general document metadata, storage, authorization, links, upload/list/detail workflows, typed custom-field definitions and values, dynamic controls, activity event creation, timelines, and deduplicated document aggregation.

### Phase 05: Security audit, verification, and cleanup

Exercise all cross-tenant negative paths, document authorization, search isolation, lifecycle constraints, migration parity, stale-reference searches, and full Nx checks. Remove compatibility artifacts only after runtime cutover and verification. Preserve historical migrations.

## Expected implementation surfaces

- `apps/api/prisma/tenant.prisma`
- `apps/api/prisma/tenant-migrations/`
- `apps/api/prisma/seed.cjs`
- `libs/api/core/src/lib/tenant-schema-provisioner.ts`
- `libs/api/api-interfaces/src/lib/`
- `libs/api/features/`
- `apps/api/src/app/app.module.ts`
- `libs/shared/frontend/api-clients/src/lib/api-clients.ts`
- `apps/web/src/app/app.routes.ts`
- `apps/web/src/app/features/clients/`
- `apps/web/src/app/features/cases/`
- `apps/web/src/app/features/documents/`
- `apps/api-e2e/`
- `apps/web-e2e/`

## Shared contract impact

Replace stale Case/Client semantics with Party, Client, Matter, Proceeding, lookup, document, custom-field, activity, autocomplete, and lifecycle contracts. Keep contracts modular under `libs/api/api-interfaces/src/lib/` and re-export them through the public barrel. Use small list and autocomplete DTOs. Do not import Prisma-generated types into Angular.

True system enums should cover PartyType, MatterState, MatterPriority, DocumentSource, DocumentVisibility, CustomFieldEntityType, and CustomFieldDataType. Practice areas, stages, roles, proceeding types, categories, and organization relationship types remain database-backed records.

## Prisma and migration impact

All legal business tables belong in the tenant schema. Use authenticated tenant context rather than browser-supplied ownership fields. Add real tenant-scoped constraints and relationship uniqueness. Do not edit historical migrations. Before any data backfill, snapshot affected databases and record source/target counts, orphan checks, duplicate checks, tenant consistency, and representative mappings.

Map verified legacy Client identity to Party, business relationship to Client, contact details/identifiers/addresses to child records, and Case to Matter. Move court/proceeding fields only when their meaning is clear. Keep ambiguous mappings nullable or deferred and request approval before making a product decision.

## NestJS/API impact

All legal routes must use the existing CSRF, authentication, and workspace access guards. Services must query through `TenantContextService.required.prisma` and validate every referenced Client, Party, User, lookup, Proceeding, Document, and custom-field ID within the active tenant and authorization scope. Use explicit Matter lifecycle actions and backend-created activity events. Search and autocomplete must be small, paginated, indexed, and tenant-isolated.

## Angular/UI impact

Use Angular 22 standalone components, signals, typed Reactive Forms, `@if`/`@for`, localization, semantic tokens, and existing Spartan/UI primitives. Use segmented Person/Organization choice, autocomplete for large entity sets, multi-autocomplete for Matter Clients, searchable lookup selects with inline creation, date controls, progressive detail tabs, and existing toast/confirmation patterns. Do not preload large collections or introduce a second UI library.

## Testing and verification

Phase 01 requires Prisma validation/generation, migration review, provisioner/seed parity, data parity queries, and rollback rehearsal on disposable data.

Phase 02 requires focused Nest tests and API/e2e tests for lifecycle rules, lookup ownership, relationship invariants, search behavior, and cross-tenant rejection.

Phase 03 requires focused Angular tests, web build verification, and manual Client/Matter flows.

Phase 04 requires document authorization, custom-field validation, activity consistency, and document de-duplication tests.

Phase 05 requires full relevant Nx test, lint, and build runs, migration verification, stale-reference searches, and security review evidence.

## Rollback and data safety

Use additive schema changes and retain legacy source structures until parity and runtime cutover are complete. Rollback should mean reverting runtime reads/writes while retaining new tables, not relying on unsafe destructive down migrations. Defer legacy removal to Phase 05 and require backup, verification, and a separately reviewed migration.
