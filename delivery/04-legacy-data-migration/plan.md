# Phase 04 — Legacy Client and Case data migration

## Overview

This phase migrates the repository’s existing `Client` and `Case` data into the additive Party/Client and Matter/Proceeding model while preserving compatibility, tenant isolation, and rollback safety. The current runtime remains centered on the legacy tables, and the migration must therefore be conservative, reviewable, and verification-driven.

No blocking questions.

## Repository findings relevant to this phase

- The active Prisma tenant schema in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) still contains the legacy `Client` and `Case` tables, including single-client `Case.clientId` semantics and legacy `clientNumber` uniqueness.
- The add-on legal-domain models added earlier remain additive rather than replacements: the repo still reads and writes the legacy runtime until the migration is verified.
- The repository’s numbering and validation patterns in [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts) and [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts) are the repository-specific basis for safe migration and numbering continuity.
- The migration guidance in [docs/legal-domain/10-migration-data-safety (1).md](<../../docs/legal-domain/10-migration-data-safety%20(1).md>) requires expand-and-contract migration, evidence-based verification, and no placeholder values for required legal/business fields.
- The tenant boundary enforcement is centralized in [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts), which all migration checks must respect.

## Scope

### In scope

- Audit legacy `Client` and `Case` rows by workspace for counts, duplicates, ambiguity, and orphaned relationships.
- Create Party and Client relationship records for existing identities where mapping is unambiguous.
- Move existing emails, phone numbers, identifiers, and addresses into the new Party child structures when safe.
- Create `Matter` rows from existing `Case` rows and `MatterClient` links from existing relationships.
- Create `Proceeding` rows only when the legacy data clearly represents a formal court or proceeding record.
- Add verification checks for counts, duplicates, orphaned rows, cross-tenant leakage, and representative sample mappings.

### Out of scope

- Deleting or rewriting the legacy `Client` and `Case` runtime path before verification passes.
- Inventing missing legal/business values such as `UNKNOWN`, `N/A`, or `TEMP` placeholders.
- Broad API or UI cutover before migration parity is proven.
- Cleaning up ambiguous historical records in a way that would require unsupported assumptions.

## Expected files and modules to change

- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [apps/api/prisma/migrations](../../apps/api/prisma/migrations)
- [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts)
- [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts)
- [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts)
- [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts)
- any migration verification utilities or seed scripts created specifically for this phase

## Database and migration impact

- This migration stays additive and compatibility-first.
- The legacy tables remain readable and usable until the verification gate passes.
- The migration must preserve `workspaceId` ownership in all new Party, Matter, and Proceeding rows.
- Any new uniqueness constraints should be scoped to the active workspace and should not rely on ambiguous or placeholder values.
- Proceeding rows remain nullable where the source is undefined or informal.

## API and contract impact

- This phase does not require broad API cutover; it focuses on migration correctness and proof.
- New or adjusted DTOs must remain additive and safe for tenant-scoped data access.
- Any migration preview or validation endpoint must reject cross-tenant queries and must not leak data across workspaces.

## Frontend impact

- Frontend impact is limited and should remain read-only or validation-focused until migration verification is accepted.
- Any preview or migration-status UI must remain tenant-safe and should not force a data-model rewrite before the backend migration is proven.

## Compatibility and data-safety risks

- Ambiguous historical values are the biggest risk. The safe default is to leave those rows unmigrated and explicitly document them.
- Legacy `Case` entries may not map cleanly to a formal proceeding; the danger is false certainty, not missing a row.
- Cross-tenant integrity checks must be enforced server-side because browser-provided IDs cannot be trusted.
- The repo currently stores `Client` and `Case` as the source-of-truth runtime, so a destructive migration would risk data loss and rollback issues.

## Test and verification strategy

1. Run workspace-scoped count checks for legacy `Client`, `Case`, and the migrated target tables.
2. Run orphan and duplicate checks across `Party`, `Client`, `Matter`, `MatterClient`, and `Proceeding` rows.
3. Validate tenant scoping with same-workspace and cross-tenant rejection tests.
4. Spot-check representative migrated rows for identity fidelity and relationship continuity.
5. Record the exact commands and results before any runtime cutover is approved.

## Decisions requiring approval

- Keep the legacy `Client` and `Case` tables in place until migration verification passes.
- Do not invent placeholder values for identity or proceeding data.
- Migrate proceedings only where the source meaning is clear and formal.

## Completion gate

This phase is complete only when the legacy Client/Case data has been migrated without unexplained count mismatches, duplicate or cross-tenant relations, or ambiguous business assumptions that require user decisions.
