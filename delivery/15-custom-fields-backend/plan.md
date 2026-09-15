# Phase 15 — Custom fields backend

## Overview

This phase introduces typed, tenant-scoped custom field infrastructure for future office-specific legal data without using arbitrary JSON on core entities as a substitute for real domain modeling. The implementation should align with the repo’s existing Prisma + NestJS + tenant-scoped pattern and reuse the current lookup and validation conventions rather than introducing a separate architecture.

No blocking questions.

## Repository findings relevant to this phase

- The current tenant schema in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) still has `customFields` as raw JSON on legacy `Client` and `Case` models, which is exactly the pattern the legal-domain guidance explicitly warns against for structured business data.
- The repo already uses workspace-scoped and tenant-scoped validation patterns through services like [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts), the workspace access guard, and the tenant context services in [libs/api/core](../../libs/api/core).
- The legal-domain specification for custom fields is in [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>), and the tenant/security rules are in [docs/legal-domain/09-security-tenancy (1).md](<../../docs/legal-domain/09-security-tenancy%20(1).md>).
- The earlier phase decisions recorded in [delivery/02-party-client-foundation/decisions.md](../02-party-client-foundation/decisions.md) and [delivery/03-matter-proceeding-foundation/decisions.md](../03-matter-proceeding-foundation/decisions.md) confirm the repo is intentionally adding foundation tables and staying additive rather than destructive.
- The repository is still not yet at a custom-field implementation stage; this is a clean backend-level addition rather than a refactor of existing custom-field code.

## Scope

### In scope

- Add `CustomFieldDefinition`, `CustomFieldOption`, and `CustomFieldValue` tables using repository-appropriate storage.
- Support entity types `CLIENT`, `PARTY`, `MATTER`, `PROCEEDING`, and `DOCUMENT`.
- Support field data types `TEXT`, `TEXTAREA`, `INTEGER`, `DECIMAL`, `MONEY`, `DATE`, `DATETIME`, `BOOLEAN`, `SINGLE_SELECT`, `MULTI_SELECT`, `PARTY_REFERENCE`, `CLIENT_REFERENCE`, and `USER_REFERENCE`.
- Allow optional `practiceAreaId` scoping on custom-field definitions.
- Enforce backend validation of value types and tenant ownership of referenced IDs.
- Keep inactive definitions and options readable for historical values.
- Provide minimal service/API operations for admin config and dynamic form value retrieval/update.
- Add tests for key type families and cross-tenant rejection.

### Out of scope

- Building a large custom-field admin product beyond the minimal CRUD/configuration API required by dynamic forms.
- Replacing all existing `customFields` JSON fields immediately in the legacy runtime path unless a later migration phase explicitly requires it.
- Broad refactors of unrelated modules and entities.
- Inventing placeholder business data or unclear custom fields to satisfy schema constraints.

## Expected files and modules to change

Likely impact points:

- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [apps/api/prisma/tenant-migrations](../../apps/api/prisma/tenant-migrations)
- [apps/api/src/app](../../apps/api/src/app) or the relevant feature module roots for API wiring
- a new or existing custom-fields feature module under [libs/api/features](../../libs/api/features)
- repository service patterns for references and lookup validation in [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts)
- tenant and workspace validation code in [libs/api/core](../../libs/api/core)
- shared API interface types if the backend exposes the custom-field config/value contract to the frontend

## Database and migration impact

- Must be additive and compatibility-safe.
- Add new custom-field entities with workspace-specific ownership and entity type semantics.
- Use proper tenant/workspace scoping on all custom-field definitions, options, and values.
- Preserve existing `Client.customFields` and `Case.customFields` JSON fields during the initial phase; do not delete or repurpose them yet unless a later migration step explicitly validates it.
- Include verification queries for definition/value ownership, option linkage, and historical inactive records.

## API and contract impact

The API should expose the minimal dynamic custom-field operations, likely around:

- listing field definitions for an entity type + optional practice area
- creating/updating definitions and options
- fetching current values for a target entity
- saving/updating typed values
- validating IDs and type rules in the backend before persistence

This should follow the repo’s current NestJS + Prisma conventions and workspace-scoped validation, not a new REST style.

## Frontend impact

When this phase is consumed by the frontend, the UI can render typed controls based on `data_type`:

- TEXT/TEXTAREA/INTEGER/DECIMAL/MONEY/DATE/DATETIME/BOOLEAN
- SINGLE_SELECT/MULTI_SELECT using the repo’s searchable select pattern
- PARTY_REFERENCE/CLIENT_REFERENCE/USER_REFERENCE using existing autocomplete patterns

This should remain limited to dynamic-form rendering and not become a large custom-admin UI in the same phase.

## Compatibility and data-safety risks

- The repo currently uses JSON blobs for custom data in legacy client and case records, so moving to a typed model must remain additive and compatibility-safe.
- Cross-tenant reference validation is critical: custom-field values and selected option IDs must be checked against the current tenant before use.
- Historical values must remain readable when a definition or option is deactivated.
- Type conversion and validation must happen on the backend; client-side validation should not be treated as security enforcement.

## Test and verification strategy

Add targeted tests covering:

1. valid value creation for each major type family (text, number, boolean, select, reference);
2. invalid value rejection for mismatched type families;
3. cross-tenant definition or reference rejection;
4. deactivated definition/option remain readable for historical values;
5. `practiceAreaId` scoping and definition lookup behavior;
6. multi-select and reference-id validation.

Verification after implementation:

- run the relevant API/Jest tests for the custom-fields and tenant validation modules;
- run targeted type-check/build validation if the contract introduces new DTOs or shared interfaces;
- record exact commands and outcomes in [delivery/15-custom-fields-backend/verification.md](./verification.md).

## Decisions requiring approval

- Keep the new custom-field system additive and do not immediately replace the legacy `customFields` JSON fields in current runtime models.
- Use the repository’s existing workspace-scoped references and tenant validation patterns rather than introducing a separate subsystem.
- Keep the first implementation limited to the minimum admin/configuration and dynamic value CRUD needed for typed custom fields.

## Completion gate

This phase is complete when custom values are typed and validated in a dedicated backend subsystem instead of being stored as arbitrary untyped extra data on core entities.
