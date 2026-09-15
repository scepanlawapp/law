# Phase 06 — Matter backend API

## Overview

This phase implements the Matter backend API around the legal-domain model of `Matter` + `MatterClient` + `MatterParticipant` + `Proceeding`, while staying within the repository’s existing NestJS + Prisma + tenant-scoped service conventions. The repo already has an additive Matter foundation in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) and a minimal service in [libs/api/features/matters/src/lib/matters.service.ts](../../libs/api/features/matters/src/lib/matters.service.ts), but the live runtime still retains the legacy `Client`/`Case` model and must not be rewritten destructively.

No blocking questions.

## Repository findings relevant to this phase

- The active Prisma tenant schema already contains `Matter`, `MatterClient`, `MatterParticipant`, `MatterParticipantRole`, `Proceeding`, `PracticeArea`, `MatterStage`, `ParticipantRole`, and `ProceedingType`, plus the required workspace-scoped indexes.
- The current app wiring in [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts) includes `MattersModule`, which shows the repo has already introduced the Matter feature as an additive module.
- The minimal Matter service already implements the repository-specific numbering pattern and lifecycle validation: it generates `MT-#######` values through `DomainCounter` and enforces a minimum client requirement before opening a matter.
- The repository’s tenant safety pattern remains centralized in the core workspace access logic and the `TenantContextService` pattern used throughout the API.
- The Phase 03 and Phase 04 artifacts explicitly keep the legacy `Client`/`Case` runtime intact and treat the Matter/Proceeding foundation as an additive compatibility layer until migration verification is complete.
- The Phase 05 Client API decision set continues to require relationship-based contact persons and tenant-safe validation, which matters for MatterClients and MatterParticipants.

## Scope

### In scope

- Implement or refactor the Matter backend API to express the target Matter model without relying on a single-client or single-proceeding assumption.
- Support Draft creation with the minimum approved data needed for a valid matter record.
- Enforce the V1 rule that a matter cannot be opened without at least one Client relationship.
- Support multiple `MatterClient` links, including primary Client behavior if the approved product flow requires it.
- Implement participant and role add/update/remove workflows using the generic `MatterParticipant` + `MatterParticipantRole` pattern.
- Implement Proceeding create/update/remove-or-archive workflows in line with data-history principles.
- Add filters for status, practice area, stage, responsible user, Client, and priority where the product plan supports them.
- Add server-side search for internal number, title, and Client display name.
- Preserve repository-standard pagination and sorting behavior.
- Validate all foreign IDs and lifecycle transitions on the backend.
- Add targeted positive and negative API/service tests for tenant safety and lifecycle rules.

### Out of scope

- Replacing the legacy Client/Case runtime before the migration gate is complete.
- Destructive schema cleanup or a large-cutover rewrite of older models.
- New infrastructure for search engines or external indexing services unrelated to the repo’s existing approach.
- Placeholder values for missing legal/business data.
- Broad frontend redesign beyond the API contract required to support the Matter feature.

## Expected files and modules to change

- [libs/api/features/matters/src/lib/matters.service.ts](../../libs/api/features/matters/src/lib/matters.service.ts)
- [libs/api/features/matters/src/lib/matters.controller.ts](../../libs/api/features/matters/src/lib/matters.controller.ts)
- [libs/api/features/matters/src/lib/matters.dto.ts](../../libs/api/features/matters/src/lib/matters.dto.ts)
- [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts)
- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) only if additive compatibility updates are required by this implementation
- [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts) only if a module export or registration adjustment is required
- targeted test files under the API test area for Matter lifecycle and tenant-boundary validation

## Database and migration impact

- This phase should remain additive and compatibility-safe.
- The existing `Matter`/`Proceeding` models are already present and can be expanded through the same repository conventions rather than a rewrite.
- `MatterClient` should continue to use a many-to-many relationship model consistent with the existing `Matter:Client` pattern.
- `MatterParticipant` should remain generic and role-driven, not converted into an opposing-party special case.
- Proceeding records should remain a separate tenant-scoped model rather than being collapsed into `Matter` fields.
- The migration gate from Phase 04 is still relevant: only after verification should broader legacy-runtime cuts over be considered.

## API and contract impact

- The Matter API should follow the repository’s established NestJS controller/service/DTO conventions and existing pagination pattern.
- Endpoints should remain consistent with the app’s current structure rather than introducing a parallel REST style.
- Input and output DTOs should be shaped for real UI consumption, not raw Prisma graphs.
- All external IDs for clients, participants, practice areas, stages, responsible users, and proceedings must be validated against the current workspace and authorization scope.
- Search, filtering, and detail endpoints should not leak cross-tenant data or cross-workspace references.

## Frontend impact

- Frontend work is mostly downstream from the API contract and should remain minimal unless the product needs immediate form integration.
- Matter create/open workflows should expose searchable selects, client autocomplete, and compact status controls consistent with the existing designs.
- The API should support the required V1 UI flows without forcing a new state model in the frontend.

## Compatibility and data-safety risks

- The main technical risk is continuing to treat the legacy `Client` model as if it were the same as the legal-domain `Client` relationship. The service must enforce the Matter relationship rules rather than assuming one fixed client shape.
- The repo currently contains single-case semantics in the legacy runtime, so broad assumptions about one proceeding or one client per matter would be unsafe.
- Cross-tenant leaks are possible if filters or relationship checks are not fully workspace-scoped.
- A matter opening flow can accidentally allow invalid data if the transition checks are only client-side instead of enforced server-side.

## Test and verification strategy

1. Add service-level tests for valid draft creation and legal open transition.
2. Add negative tests for opening a matter without a client and for invalid lifecycle transitions.
3. Add tests for multiple client links and primary-client behavior when supported.
4. Add tests for participant and proceeding validation, including foreign-ID rejection and tenant mismatch checks.
5. Run the smallest relevant Nx test target once implementation is approved and record the exact command output in the Phase 06 verification artifact.

## Decisions requiring approval

- Keep the additive `Matter`/`Proceeding` model in place while the legacy Client/Case runtime remains active.
- Preserve the repo’s existing numbering and validation conventions, including the `DomainCounter` pattern already in use.
- Do not collapse participants into a special `OppositeParty` model; use the generic `MatterParticipant` + role approach.
- Continue to treat proceedings as a separate model rather than as a single field on a matter.

## Completion gate

This phase is complete when the Matter API expresses the target legal-domain model without legacy single-client or single-proceeding constraints, validates all tenant-scoped references, and passes targeted positive and negative tests.
