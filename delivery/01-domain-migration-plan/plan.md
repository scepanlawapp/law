# Phase 01 — Domain migration plan

## Overview

This phase translates the legal-domain target model into a repository-specific staged migration plan while preserving the current tenant-aware architecture and the existing Client/Case data. The objective is not to rewrite the product, but to document a safe sequence for introducing the target legal domain without data loss or destructive schema changes.

No blocking questions.

## Repository findings relevant to this phase

- The runtime schema is still Client/Case-centric in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- Current contract types and UI are still built around `Client*` and `Case*` in [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts), [apps/web/src/app/features/clients](../../apps/web/src/app/features/clients), and [apps/web/src/app/features/cases](../../apps/web/src/app/features/cases).
- Tenant access is already enforced through [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts) and related multi-tenant auth code, so the migration must remain tenant-scoped and additive.
- The target model is defined by [docs/legal-domain/02-domain-map.md](../../docs/legal-domain/02-domain-map.md), [docs/legal-domain/03-party-client (1).md](<../../docs/legal-domain/03-party-client%20(1).md>), [docs/legal-domain/04-matter-proceeding (1).md](<../../docs/legal-domain/04-matter-proceeding%20(1).md>), [docs/legal-domain/05-documents (1).md](<../../docs/legal-domain/05-documents%20(1).md>), [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>), and [docs/legal-domain/10-migration-data-safety (1).md](<../../docs/legal-domain/10-migration-data-safety%20(1).md>).
- The repo does not yet have a generic legal-domain document model; it is still chat-attachment oriented rather than document-link oriented.

## Scope

### In scope

- Mapping the existing Client/Case model to the legal-domain target model.
- Designing a staged migration plan that preserves data and the current multi-tenant model.
- Identifying required API and frontend compatibility work.
- Defining verification gates and rollback-safe constraints.

### Out of scope

- Implementing the migration.
- Destructive schema changes.
- Removing legacy tables or code paths before verification.
- Inventing placeholder values for ambiguous fields.

## Domain mapping plan

### Client and Party

- Treat `Client` as the law firm’s relationship with a `Party`, not as the final identity record.
- Map current `Client` rows to a `Party` record plus a `Client` relationship record that preserves legal relationship state and client-specific metadata.
- Map `ClientAddress` to `PartyAddress` and `ClientContact` to `PartyContactPoint`.
- For organization contact persons, use `PartyRelationship` rather than embedding contact-person fields directly on the `Client` entity.

### Case and Matter

- Treat the current `Case` model as the source for the initial `Matter` migration.
- Convert `Case` rows into `Matter` rows while preserving internal-case numbering behavior unless a product choice changes the numbering format.
- Replace one-to-one `Case.clientId` assumptions with `MatterClient` records and a single primary-client design.
- Convert `CaseResponsibility` into matter staffing or participant-based records while keeping historical records readable.

### Proceeding

- Only map data into `Proceeding` when it clearly represents a formal proceeding.
- Keep court, judge, and authority fields nullable unless product rules clearly identify them as legal proceeding data.
- Avoid creating fake proceeding values or hidden assumptions about a one-proceeding-per-matter model.

### Documents

- Keep the current document reality separate from the legal-domain document model until a dedicated document migration is implemented.
- Align future `Document` work with the repo’s existing storage and permission approach, not a parallel file storage model.
- Use link tables such as `ClientDocument`, `MatterDocument`, and `ProceedingDocument` to avoid duplicate stored file bytes.

## Concrete migration sequence

1. Additive schema phase

- Add `Party`, `PartyAddress`, `PartyContactPoint`, `PartyIdentifier`, and `PartyRelationship` tables.
- Add `Matter`, `MatterClient`, `MatterParticipant`, `MatterParticipantRole`, and `Proceeding` tables.
- Add lookup tables for `PracticeArea`, `MatterStage`, `ParticipantRole`, `ProceedingType`, `DocumentCategory`, and `OrganizationRelationshipType` in the same workspace-scoped pattern as the current references API.
- Add custom-field definition and value tables to support typed fields without unstructured JSON misuse.

2. Backfill phase

- Create one `Party` per current `Client` row.
- Preserve the existing client relationship state as the `Client` record attached to the correct `Party`.
- Migrate address/contact records from the legacy tables to the new Party model.
- Generate the new client relationship code or identifier from the existing `clientNumber` while keeping workspace uniqueness constraints.
- Convert `Case` rows to `Matter` rows and retain numbering behavior as the migration source unless product policy changes it.

3. Relationship phase

- Replace direct `Case.clientId` references with `MatterClient` rows.
- Convert `CaseResponsibility` into participating/staffing records while retaining historical activity and deactivation semantics.
- Use generic `MatterParticipant` records instead of a special-purpose opposite-party model.

4. Compatibility phase

- Keep legacy `Client` and `Case` tables readable while the new runtime path is introduced.
- Add temporary DTO/service adapters to avoid breaking the current Angular contracts during migration.
- Delay the full UI cutover until parity checks prove the new path is safe.

5. Verification phase

- Validate row counts, orphans, duplicates, and tenant-locality checks before switching runtime traffic.
- Keep legacy data available for rollback until all checks pass.

## Expected files and modules impacted

- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [apps/api/prisma/tenant-migrations](../../apps/api/prisma/tenant-migrations)
- [package.json](../../package.json)
- [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts)
- [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts)
- [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts)
- [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts)
- [apps/web/src/app/features/clients](../../apps/web/src/app/features/clients)
- [apps/web/src/app/features/cases](../../apps/web/src/app/features/cases)
- future `parties`, `matters`, `proceedings`, and `documents` modules following the same Nx pattern

## Database and migration impact

- Must be additive and expand-and-contract rather than destructive.
- Existing Client/Case data must remain readable throughout the migration.
- Every new relationship and table must preserve workspace/tenant locality.
- Ambiguous proceeding data should remain nullable until there is product clarity.

## API and contract impact

- Current shared API contracts are still built around `Client*` and `Case*` names.
- A compatibility layer or temporary dual-read/write path is likely necessary for the transition.
- All request IDs must still be checked against the active workspace and tenant ownership rules.

## Frontend impact

- Searchable autocomplete and select controls will be necessary for parties, clients, matter participants, roles, and lookup fields.
- Existing Angular forms should be adapted to the migrated model rather than replaced with a parallel architecture.
- The UI should reuse the repo’s design system and current form conventions.

## Compatibility and data-safety risks

- Current code paths are heavily bound to `clientId` and `caseId` in routes, DTOs, service logic, and UI state.
- There is currently no generic document-domain model, so document migration needs a dedicated additive phase.
- Some `Case` data may not cleanly correspond to formal proceedings; those should remain ambiguous and nullable rather than guessed.
- Placeholder or synthetic values should not be invented to satisfy required fields during migration.

## Verification strategy

1. Validate Prisma schema syntax and migration compatibility.
2. Run migration-diff checks before and after schema changes.
3. Add focused migration-parity tests for row counts, duplicates, orphans, and tenant scoping.
4. Run the most relevant API and lint/type-check targets for the affected modules.
5. Record the exact commands and outcomes in [delivery/01-domain-migration-plan/verification.md](./verification.md).

## Decisions requiring approval

- Treat the current `Case` table as the source of the initial `Matter` migration rather than inventing a parallel matter model from scratch.
- Keep ambiguous proceeding data nullable until product validation confirms the mapping.
- Maintain compatibility with current `Client`/`Case` contracts during the initial migration stage instead of forcing an immediate frontend cutover.

## Completion gate

This phase is complete when the migration plan is concrete, repository-specific, and preserves data safety with no unacknowledged migration risk.
