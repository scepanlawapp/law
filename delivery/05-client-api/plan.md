# Phase 05 — Client backend API

## Overview

This phase implements the Client backend API around the legal-domain model of `Party` + `Client` + organization contact-person relationships, while keeping the repository’s existing NestJS + Prisma + tenant-scoped patterns intact. The runtime is still compatibility-first: the repo currently exposes the legacy `Client` and `Case` schema in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma), and the new legal-domain model remains additive rather than a destructive replacement.

No blocking questions.

## Repository findings relevant to this phase

- The active tenant schema still centers the runtime on `Client`, `ClientAddress`, `ClientContact`, `Case`, and `Matter` tables. The legal-domain target remains an additive layer rather than the live source of truth.
- The repository’s service conventions in [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts) and [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts) provide the current pattern for numbering, validation, responsible-user checks, and tenant-windowed queries.
- The app wiring in [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts) currently includes `ClientsModule`, `CasesModule`, `MattersModule`, and `ReferencesModule`, with no Party-specific API module yet in active runtime.
- The legal-domain specification in [docs/legal-domain/03-party-client (1).md](<../../docs/legal-domain/03-party-client%20(1).md>), [docs/legal-domain/08-api-search (1).md](<../../docs/legal-domain/08-api-search%20(1).md>), and [docs/legal-domain/09-security-tenancy (1).md](<../../docs/legal-domain/09-security-tenancy%20(1).md>) requires Party-based identities, organization contact-person relationships, tenant-scoped search, and IDOR-safe validation.
- The prior Phase 02 and Phase 04 planning artifacts explicitly preserve existing `Client`/`Case` data and delay large cutovers until migration safety is verified.

## Scope

### In scope

- Implement or refactor the Client backend API to align with the `Party` + `Client` model without breaking the repo’s current service/controller conventions.
- Support PERSON and ORGANIZATION creation rules consistent with the domain specification.
- Support multiple contact points, identifiers, addresses, and notes in a tenant-safe structure.
- Support organization contact persons by linking an existing PERSON `Party` or creating a new PERSON row and `PartyRelationship` in a single service transaction.
- Validate responsible-user, status, and tenant ownership checks in the same style as the current repository services.
- Keep list/detail DTOs shaped for UI consumption rather than exposing raw ORM graphs.
- Add service-level tests for the important creation, validation, and security rules introduced in this phase.

### Out of scope

- A full legal-domain cutover of front-end screens or unrelated modules.
- Experimental search infrastructure beyond the repository’s existing server-side search/list patterns.
- Inventing placeholder business values for missing legal identifiers or relationship data.
- Broad migration rewrite or destructive schema changes before the migration plan is executed and verified.

## Expected files and modules to change

- [libs/api/features/clients/src/lib/clients.controller.ts](../../libs/api/features/clients/src/lib/clients.controller.ts)
- [libs/api/features/clients/src/lib/clients.dto.ts](../../libs/api/features/clients/src/lib/clients.dto.ts)
- [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts)
- [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts)
- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) if the API requires additive schema compatibility or a safe model alignment for the target phase
- [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts) only if a new Party module or wiring is required by the approved implementation
- test files in the client or app test area for positive and negative API/service validation

## Database and migration impact

- This phase is expected to remain additive and compatibility-safe.
- The existing legacy `Client` schema remains readable while the new legal-domain model is introduced through an API layer that respects the target contract.
- Any new relationship records must be workspace-scoped and must enforce cross-tenant ownership checks before assignment.
- Relationship data for organization contact persons should be modeled through `PartyRelationship` rather than direct `Client` columns.
- If the repository still lacks a Party-backed runtime module, the implementation should be added in the same style as the existing feature modules rather than introducing a parallel architecture.

## API and contract impact

- The Client API should follow the repository’s established NestJS controller/service/DTO conventions and existing response shapes.
- The implementation should remain additive to the current contracts unless a narrow refactor is required for the target domain model.
- Search and listing should use repository-standard filtering/pagination patterns rather than a new API style.
- All details, updates, and relationship mutations must verify that the referenced `Party`, `Client`, `OrganizationRelationshipType`, `User`, and related IDs belong to the current tenant and active authorization scope.

## Frontend impact

- Frontend impact is limited to the next phase and should be handled as a later step unless the API contract is intentionally shaped to support the existing UI pattern.
- Any client search or autocomplete should remain server-side and tenant-safe.
- The API should keep list/detail DTOs compact and presentational to avoid leaking ORM graphs or cross-tenant data.

## Compatibility and data-safety risks

- The largest risk is accidentally treating the legacy `Client` model as the identity layer while the domain spec requires a `Party` record with a `Client` relationship.
- Organization contact relations can easily become duplicated or cross-linked across workspaces if service queries are not scoped from the start.
- Search by email/phone or nested organization contact should not expose unrelated tenant data.
- The repository still contains current runtime assumptions about single-client `Case` relations; the API should avoid broad assumptions while the migration model is still under verification.

## Test and verification strategy

1. Add service-level tests for valid PERSON and ORGANIZATION creation.
2. Add negative tests for missing required values, invalid status transitions, and invalid tenant ownership.
3. Add tests for organization contact-person linking and transaction safety.
4. Add tests that reject cross-tenant references when a `Party`, relationship type, or related entity is unrelated to the active workspace.
5. Run the smallest relevant Nx test target after implementation, with exact command output recorded in the delivery verification artifact.

## Decisions requiring approval

- Keep the repo’s compatibility-first runtime intact until migration validation is explicitly complete.
- Reuse the existing client service/controller conventions rather than introducing a separate or competing API architecture.
- Prefer an additive `PartyRelationship`-based contact-person workflow over embedding organization contact fields into `Client`.

## Completion gate

This phase is complete when the Client API supports the required `Party` + `Client` model, validates tenant ownership for all references, and passes targeted positive and negative tests without leaking or accepting cross-tenant data.
