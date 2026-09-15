# Phase 03 — Matter, participants, and proceedings

## Overview

This phase adds the first legal-domain Matter aggregate and proceeding foundation without replacing the legacy Client/Case runtime. The repository is still centered on the single-client Case model in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma), but the target domain requires multi-client, multi-participant, and multi-proceeding behavior as defined in [docs/legal-domain/04-matter-proceeding (1).md](<../../docs/legal-domain/04-matter-proceeding%20(1).md>), [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>), [docs/legal-domain/09-security-tenancy (1).md](<../../docs/legal-domain/09-security-tenancy%20(1).md>), and [docs/legal-domain/10-migration-data-safety (1).md](<../../docs/legal-domain/10-migration-data-safety%20(1).md>).

No blocking questions.

## Repository findings relevant to this phase

- The active tenant schema remains Case-centric. `Case` still has one required `clientId` and one `caseNumber`, and the current service path in [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts) assumes a single-client workflow.
- The lookup pattern is still narrow but reusable: [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) and [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts) implement tenant-scoped `tag`, `caseType`, and `practiceArea` lookup CRUD.
- The central tenant enforcement point is [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts); all Matter/Proceeding relationship validation must respect the authenticated workspace and active user membership.
- Phase 01 and 02 established that the legacy Client/Case tables are migration source data, not the end-state model.

## Scope

### In scope

- Additive `Matter` schema with internal number, lifecycle state, practice area, stage, priority, responsible user, dates, audit metadata, and archive behavior.
- `MatterClient` many-to-many join with optional primary-client semantics if the approved design keeps that flag.
- `MatterParticipant` and `MatterParticipantRole` for party associations and role-based participation.
- Separate `Proceeding` model under a Matter with independent external numbers and nullable authority/judge fields in V1.
- Same-tenant validation and workspace-scoped uniqueness rules.
- Targeted tests for multi-client, participant roles, multiple proceedings, and tenant safety.

### Out of scope

- Replacing the existing `Case` runtime path end-to-end.
- Backfilling all historical `Case` records into `Matter` rows in this phase.
- A full public Matter API cutover before the dedicated backend API phase.
- Inventing placeholder business values or broad legal enums beyond existing repo conventions.

## Planned implementation sequence

1. Schema foundation
   - Add `Matter`, `MatterClient`, `MatterParticipant`, `MatterParticipantRole`, `Proceeding`, `MatterStage`, `ParticipantRole`, and `ProceedingType` in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) without removing or turning `Case` into `Matter`.
   - Keep the numbering pattern aligned with the existing `DomainCounter` pattern used in [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts).

2. Lifecycle and validation rules
   - Create DRAFT matters with title only; require title and at least one active client before the backend will allow OPEN state.
   - Validate tenant-scope on `matterId`, `clientId`, `partyId`, and lookup IDs before creating links or proceedings.
   - Keep archival and historical records readable without destructive deletes.

3. Reference extension
   - Expand the existing reference pattern in [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) and [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts) to include `matterStage`, `participantRole`, and `proceedingType`.

4. Minimal backend foundation
   - Add a narrow service/controller foundation for Matter creation and retrieval following the current NestJS feature conventions.
   - Keep the API additive and compatible with the existing Client/Case contracts while the full Matter API is developed later.

5. Tests
   - Cover multi-client links, participant roles, multiple proceedings, DRAFT/OPEN validation, and cross-tenant rejection.

## Database and migration impact

- Uses additive schema changes and expansion without removing the legacy tables or data.
- New uniqueness constraints should include `workspaceId + internalNumber`, `matterId + clientId`, and per-participant role uniqueness.
- Proceeding authority and judge values remain nullable in V1 unless a trusted source exists.

## API and contract impact

- The current Case DTO flow is not adequate for multi-client and multi-proceeding behavior, so this phase adds focused Matter/Proceeding types rather than rewriting the existing contracts.
- Lookup endpoints add the new reference families while preserving the current `caseType` and `practiceArea` routes.
- All ID checks must remain server-side and workspace-scoped.

## Frontend impact

- Matter creation should support multi-client autocomplete, searchable stage and practice-area selects, responsible-user selection, and create/update flows for participants and proceedings.
- This phase keeps the frontend scope narrow and backend-focused so the data model stabilizes before a broader UI cutover.

## Compatibility and data-safety risks

- The current `Case` implementation assumes one client and a single-case workflow; reusing it directly would preserve the wrong assumptions.
- Legacy proceeding data may be ambiguous, so those fields must stay nullable instead of being guessed.
- Cross-tenant validation must reject any invalid foreign key even when the browser sends a known ID.

## Verification strategy

1. Validate the Prisma schema and migration SQL for the new Matter/Proceeding tables.
2. Run focused Jest tests for DRAFT/OPEN validation, multi-client linking, participant-role rules, multiple proceedings, and tenant-boundary denial.
3. Run targeted type-check and lint checks for the affected API modules.
4. Record the exact commands and results in the verification artifact for this phase.

## Decisions requiring approval

- Keep the legacy `Case` model intact and add a separate `Matter` aggregate instead of reusing `Case` as the Matter model.
- Use `MatterClient` as a many-to-many join with optional primary semantics rather than a single `matter.clientId` column.
- Keep proceeding authority/judge fields nullable in V1 unless a trusted source-of-truth directory already exists.

## Completion gate

This phase is complete when the Matter model supports multiple clients, multiple participants/roles, and multiple proceedings without relying on the legacy single-client or single-proceeding assumptions.
