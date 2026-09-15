# Phase 00 — Repository discovery and baseline

## Scope

This phase is intentionally limited to repository analysis and planning. No production or domain code changes are included.

## No blocking questions.

The repository provides enough evidence to proceed without additional questions.

## Repository findings

### Backend platform

- NestJS 11 with Nx monorepo structure.
- API app is assembled in [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts).
- Feature modules currently include `AuthModule`, `ChatModule`, `ClientsModule`, `CasesModule`, `ReferencesModule`, and `UserSettingsModule`.
- Validation is handled via NestJS DTO validation and repository service checks.

### Database and tenancy

- Prisma is the ORM and migration system.
- The project has separate platform and tenant Prisma schemas: [apps/api/prisma/platform.prisma](../../apps/api/prisma/platform.prisma) and [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- Tenant schema is still Client/Case-centric and includes `Client`, `Case`, `ClientTag`, `CaseTag`, lookup tables, and chat-related models.
- Tenant isolation is enforced through workspace and tenant context services; see [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts).

### Existing domain model

- The live runtime model represents `Client` and `Case`, not the target legal-domain model of `Party`, `Matter`, `Proceeding`, and `Document`.
- The legal-domain specification under [docs/legal-domain/README (2).md](<../../docs/legal-domain/README%20(2).md>) is the authoritative target.
- Current API contracts in [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts) still expose `Client*` and `Case*` types.

### Frontend

- Angular 22 app under [apps/web](../../apps/web) with standalone components and reactive forms.
- UI is feature-based, with existing client/case forms and detail components under [apps/web/src/app/features/clients](../../apps/web/src/app/features/clients) and [apps/web/src/app/features/cases](../../apps/web/src/app/features/cases).
- The repo uses Angular + Tailwind + Spartan-style UI patterns, with searchable selects/autocomplete patterns expected for large lookup lists.

### Tests and verification

- Jest is the test framework via Nx tasks.
- Existing test coverage is limited; there are some auth and e2e examples, but not a mature set for clients/cases/business rules.

## Exact scope and non-scope

### In scope

- Reading and mapping the repo accurately.
- Documenting the current vs target domain mismatch.
- Capturing the migration and safety risks before any implementation.
- Creating the required Phase 00 delivery files.

### Out of scope

- Any production domain rewrite.
- Any schema migrations or runtime code changes.
- Any client/case feature refactor.
- Any attempt to invent placeholder legal-domain data.

## Expected files/modules impacted by the next phase

This phase is discovery-only, but the next legal-domain implementation will likely touch:

- [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts)
- [libs/api/features/clients/src/lib/clients.controller.ts](../../libs/api/features/clients/src/lib/clients.controller.ts)
- [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts)
- [libs/api/features/cases/src/lib/cases.controller.ts](../../libs/api/features/cases/src/lib/cases.controller.ts)
- [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts)
- [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts)
- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [apps/web/src/app/features/clients](../../apps/web/src/app/features/clients)
- [apps/web/src/app/features/cases](../../apps/web/src/app/features/cases)
- [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts)

## Database and migration impact

- Any legal-domain migration must be additive and tenant-safe.
- The existing schema should remain readable during migration.
- Existing `Client` and `Case` data must be preserved while targeted Party/Matter/Proceeding or document models are introduced.
- The repository’s migration guidance explicitly prefers expand-and-contract patterns and data verification queries.

## API and contract impact

- Current API contracts are `Client`/`Case`-based and will need staged refactoring or compatibility shims.
- Shared types under `@law/api-interfaces` are a central dependency; they will need changes as the contract evolves.
- Authorization and tenant-scoped filtering must remain in place; no cross-tenant data leakage is permitted.

## Frontend impact

- Screens must continue to match the repository’s Angular/reactive form conventions.
- Searchable selects/autocomplete patterns should be reused for matters, parties, and configurable lookup values.
- Configurable lookup fields should follow the existing references pattern rather than creating a different UI architecture.

## Compatibility and data-safety risks

- The repository has a significant model gap between the current schema and the legal-domain target.
- Mixed old/new IDs and links may appear during an incremental migration.
- Legal-domain naming and entity semantics differ from the current `Client`/`Case` terminology, so migration logic must preserve business meaning rather than symbol names alone.
- Document linkage must remain tenant-bound and not allow cross-tenant references.

## Test and verification strategy

- Add focused tests around tenant-scoped validation and migration compatibility when the implementation phase begins.
- Validate API contract and lookup behavior with the relevant Nx Jest tests.
- Run the most relevant lint/type-check/test commands for the affected backend/frontend modules.
- Record actual commands and outcomes in [delivery/00-repository-discovery/verification.md](./verification.md).

## Decisions requiring approval

No additional business decisions are blocking this phase. The next implementation phase should follow the repository instructions and legal-domain specification.

## Completion gate

This phase is complete when the repository map, gap analysis, and migration risks are documented sufficiently to support a safe implementation path. No production/domain code changes were made in this phase.
