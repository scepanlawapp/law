# Phase 02 — Party, Client, contacts, and lookup foundation

## Overview

This phase establishes the first legal-domain foundation in the existing Nx + NestJS + Prisma repo without altering the current runtime shape beyond additive schema and compatibility work. The goal is to add the target Party/Client/contact/relationship and lookup infrastructure required by later matter, proceeding, and document work while preserving the current tenant-scoped architecture and existing client/case data.

No blocking questions.

## Context and repository findings

- Phase 01 planning already confirmed that the current runtime model is still Client/Case-centric in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma), while the target domain model is defined in [docs/legal-domain/03-party-client (1).md](<../../docs/legal-domain/03-party-client%20(1).md>) and [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>).
- The current tenant enforcement point remains [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts), and the repo’s access checks already enforce workspace-scoped reads and writes.
- The current lookup system is still narrow and repository-specific: [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) exposes only `tag`, `caseType`, and `practiceArea` through [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts).
- The current Client model already contains individual vs organization semantics and contact/address concepts, but they are embedded in a single `Client` record. This aligns with the Party/Client separation required by the legal-domain spec but still needs the explicit new model layer.
- The work must remain additive and compatibility-first. The repository guidance explicitly prefers expand-and-contract migrations and no destructive schema changes.

## Scope

### In scope

- Add the first Party foundation tables for PERSON/ORGANIZATION identity, contact points, addresses, identifiers, and relationships.
- Add a `Client` relationship model that references a Party instead of duplicating identity data.
- Add generic lookup tables for the required foundation concepts: `PracticeArea`, `MatterStage`, `ParticipantRole`, `ProceedingType`, `DocumentCategory`, and `OrganizationRelationshipType`.
- Add tenant-safe constraints, indexes, and repository/service validation consistent with the project’s existing patterns.
- Add the initial domain tests for tenant boundaries and validation rules.

### Out of scope

- Backfilling current Client records into new Party rows in this phase.
- Replacing the legacy `Client` and `Case` runtime path end-to-end.
- Implementing Matter/Proceeding/Document entities in full.
- Large UI rewrites beyond the lookup patterns needed by this foundation.
- Inventing placeholder values or fake business data.

## Proposed implementation plan

### 1. Schema foundation

Add new models in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) alongside the existing legacy tables, following the repo’s Prisma conventions and workspace-scoped unique/index patterns.

Recommended additive tables:

- `Party`
  - `id`, `workspaceId`, `type`, `displayName`, `firstName`, `lastName`, `legalName`, `tradeName`, `notes`, `archivedAt`, audit fields.
- `PartyContactPoint`
  - `partyId`, `type`, `value`, `label`, `isPrimary`, audit fields.
- `PartyIdentifier`
  - `partyId`, `type`, `value`, `countryCode`, `issuer`, `isPrimary`, audit fields.
- `PartyAddress`
  - `partyId`, `type`, `addressLine1`, `addressLine2`, `city`, `postalCode`, `region`, `countryCode`, `isPrimary`, audit fields.
- `PartyRelationship`
  - `fromPartyId`, `toPartyId`, `relationshipTypeId`, `jobTitle`, `department`, `isPrimaryContact`, `isActive`, `notes`, audit fields.
- `OrganizationRelationshipType`
  - firm-scoped lookup with `code`, `name`, `isActive`, `sortOrder`, audit fields.
- `Client`
  - keep the legacy table as-is initially; add the new relationship-based model as a separate table or compatibility table that references `Party`, with `partyId` and `clientCode`/status/responsible user/archived fields.

This phase should not remove or replace the existing `Client` model yet. It should add the new targeted model next to it.

### 2. Lookup foundation

Extend the repository’s existing reference pattern, which currently supports `tag`, `caseType`, and `practiceArea`, to the broader legal-domain lookup family without creating a second architecture.

Expected additions to [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) and [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts):

- `matterStage`
- `participantRole`
- `proceedingType`
- `documentCategory`
- `organizationRelationshipType`

For this phase, the product may keep the initial pattern aligned to the existing `ReferenceDto` and `setActive`/`update` flow.

### 3. Validation and tenant boundaries

Reuse the same validation style as [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts) and the tenant access pattern in [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts).

Rules to enforce:

- `Party.type` must be `PERSON` or `ORGANIZATION`.
- `PERSON` requires first/last name or a display name that is consistently generated/validated.
- `ORGANIZATION` requires a legal name.
- all `Party*` records, relationship records, and lookup rows must be workspace-scoped.
- cross-tenant access checks must reject any `partyId`, `relationshipTypeId`, or lookup ID outside the current workspace.

### 4. Repository/service packaging

The repo currently exposes only `ClientsModule` and `ReferencesModule` at app startup in [apps/api/src/app/app.module.ts](../../apps/api/src/app/app.module.ts). The new Party foundation should be introduced as additive modules only when the approved schema shape requires it, following the same service/controller pattern already in use.

Recommended repository alignment:

- keep compatibility with current feature modules;
- add new `parties`/`contacts`/`references` repository logic in the same style as the existing `clients` and `references` feature libraries.

### 5. Initial tests

Add focused tests around the most important business rules introduced in this phase:

- `Party` creation rules for PERSON vs ORGANIZATION.
- tenant isolation on shared lookup and party IDs.
- organization contact relationship validation.
- lookup deactivation behavior while keeping historical references readable.

## Database and migration impact

- Must be additive and safe: create new models and indexes without removing legacy data or runtime tables.
- Use the existing Prisma migration flow under [apps/api/prisma](../../apps/api/prisma).
- Keep legacy `Client` data readable while new `Party`/`Client` relationship logic is introduced.
- Add indexes for `workspaceId` + `type`, `workspaceId` + `partyId`, and relationship queries like `fromPartyId` / `toPartyId`.
- Use `isActive` and archive/deactivation patterns rather than hard deletes for lookups and relationships when historical references exist.

## API and contract impact

- The shared API contract layer in [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts) will need additive DTOs and result types for `Party` and lookup models.
- `references` endpoints should expand to include the new lookup families without disrupting the existing `caseType` and `practiceArea` routes.
- New party-related endpoints should follow the repo’s existing `WorkspaceAccess` and `WorkspaceAccessGuard` patterns.
- For this phase, avoid forcing a full UI cutover. A compatibility layer or dual-read strategy is acceptable until later phases.

## Frontend impact

- Searchable selects and autocomplete controls are required for Party/relationship/reference data, in line with the frontend rules in the legal-domain documents.
- The repo’s current views are still built around the `Client` model, but the new foundation should start with reusable, backend-driven lookup UX patterns and not a parallel architecture.
- For a small exclusive type choice such as `PERSON` vs `ORGANIZATION`, use the repository’s existing radio/segmented-control conventions.
- Keep forms progressive and avoid large block forms in this phase; only the essential fields should be exposed initially.

## Compatibility and data-safety risks

- The repo has a single authoritative tenant context; this phase must not attempt to trust browser-supplied IDs or workspace IDs.
- Current `Client` and `Case` logic strongly assumes a legacy shape. Introducing a new Party model without compatibility checks could create either silent data drift or accidental cross-tenant linkage.
- Some business values, especially organization contact relationships, may not have a clean one-to-one mapping in existing data. These should remain nullable or deactivated rather than guessed.
- Lookup deactivation can be risky if historical references are still in use; keep records readable and avoid hard deletes.

## Test and verification strategy

Because this is a plan-phase deliverable, no implementation or code-change verification is being claimed. The eventual implementation should run the most relevant checks:

1. Prisma schema validation and migration diff check.
2. Jest tests for Party creation rules and tenant-boundary validation.
3. API tests for cross-tenant lookup/party access denial.
4. Type-check and lint for the affected API modules.
5. Record exact command output in [delivery/02-party-client-foundation/verification.md](./verification.md).

## Decisions requiring approval

- Keep the legacy `Client` table in place and add the new Party-based relationship model next to it during this phase.
- Use the repository’s existing references pattern rather than introducing a parallel lookup architecture.
- Delay any large backfill of existing Client records until the schema and validation layer has been proven safe.

## Completion gate

This phase is complete when the new Party/Client foundation, lookup base, and validation rules exist as additive repository-safe changes, tests pass for the new rules, and the legacy client/case behavior remains intact.
