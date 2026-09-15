# Phase 07 — Configurable lookup API

## Overview

This phase extends the repository’s existing `ReferencesService`/`ReferencesController` pattern to cover the legal-domain configurable lookup types required by the Matter, Client, and proceeding workflows. The repo already has the core pattern and the active schema for `PracticeArea`, `MatterStage`, `ParticipantRole`, and `ProceedingType`, so the implementation should remain additive and compatible rather than introducing a parallel lookup subsystem.

No blocking questions.

## Repository findings relevant to this phase

- The active lookup implementation is in [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) and [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts).
- The active tenant schema already contains `PracticeArea`, `MatterStage`, `ParticipantRole`, and `ProceedingType` in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- The legal-domain lookup specification in [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>) requires tenant-scoped database-backed values, deactivation instead of hard-delete, and inline-creation UX support.
- The existing pattern is workspace-scoped and uses a small `ReferenceDto` plus service-level validation, which makes it the correct extension point for the missing values.

## Scope

### In scope

- Expose lookup list/create/update/deactivate behavior for `PracticeArea`, `MatterStage`, `ParticipantRole`, `ProceedingType`, `DocumentCategory`, and `OrganizationRelationshipType`.
- Support active-only queries for form population.
- Keep lookup values tenant-scoped and stable for frontend select caches.
- Keep historical references readable while values are deactivated.
- Add duplicate-name and cross-tenant negative tests.

### Out of scope

- New search infrastructure or unrelated refactors.
- Hard-deleting lookup records with existing references.
- Replacing the repository’s current reference module with a different architecture.

## Expected files and modules to change

- [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts)
- [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts)
- [libs/api/features/references/src/lib/references.dto.ts](../../libs/api/features/references/src/lib/references.dto.ts)
- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [libs/api/core/src/lib/tenant-schema-provisioner.ts](../../libs/api/core/src/lib/tenant-schema-provisioner.ts)
- focused Jest specs under the API test area

## Database and migration impact

- This phase stays additive and compatibility-safe.
- The missing `DocumentCategory` and `OrganizationRelationshipType` records should be added as workspace-scoped lookup tables consistent with the current naming pattern.
- Deactivation must be the default history-safe handling for any lookup row with historical references.

## API and contract impact

- The `references` API should remain in the same controller/service style already used by the repo.
- Query params or list variants should support active-only retrieval for form dropdowns.
- DTOs should remain compact and stable enough for frontend caches and inline-create flows.

## Frontend impact

- The API contract should support searchable selects and inline creates for lookup values used in Matter, Client, and proceeding forms.
- No broad frontend rewrite is required in this backend phase.

## Compatibility and data-safety risks

- The repo currently has only a partial lookup implementation; extending it incorrectly could add a parallel model instead of reusing the repo’s existing pattern.
- Hard-deleting historical lookup values would silently break existing records.
- Cross-tenant leakage is a real risk if the list/create/update code is not workspace-scoped from the first query.

## Test and verification strategy

1. Add focused Jest tests for the new lookup resources.
2. Add negative tests for duplicate names and cross-workspace lookup access.
3. Verify deactivation does not hard-delete historical references.
4. Run the relevant Nx/Jest test target and record the exact output in the delivery verification artifact.

## Decisions requiring approval

- Reuse the existing reference module and permission structure rather than introducing a separate lookup subsystem.
- Keep deactivation as the default safe behavior for configurable lookup values.
- Keep all lookup data tenant-scoped and remain additive until migration safety is confirmed.

## Completion gate

This phase is complete when the lookup API covers the required values, keeps historical references readable, and rejects cross-tenant access without requiring a code deployment to add new values.
