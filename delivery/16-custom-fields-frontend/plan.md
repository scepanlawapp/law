# Phase 16 — Dynamic custom fields frontend

## Overview

This phase adds the reusable dynamic custom-field renderer and integrates it into the first approved forms. The implementation should reuse the current Angular form patterns, the existing configurable lookup and autocomplete patterns, and the backend custom-field contract introduced in Phase 15 without creating a second frontend architecture.

No blocking questions.

## Repository findings relevant to this phase

- The current repo is still built around form components that use Angular reactive forms, per-field validation, and backend-authoritative payloads; the closest example is the Matter/Case form flow in [apps/web/src/app/features/cases/case-form.component.ts](../../apps/web/src/app/features/cases/case-form.component.ts), which loads lookup data from the references client and posts a typed request object.
- The repo already has lookup and autocomplete conventions through [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts), and the selective usage pattern is already established in the current form components.
- The custom-field backend plan was recorded in [delivery/15-custom-fields-backend/changes.md](../15-custom-fields-backend/changes.md), and the legal-domain requirements for dynamic frontend controls are in [docs/legal-domain/06-lookups-custom-fields (1).md](<../../docs/legal-domain/06-lookups-custom-fields%20(1).md>) and [docs/legal-domain/07-frontend-ux (1).md](<../../docs/legal-domain/07-frontend-ux%20(1).md>).
- The repo does not yet have a reusable custom-field renderer, so this is a greenfield frontend addition around the backend contract rather than a refactor of existing dynamic field code.

## Scope

### In scope

- Build a reusable dynamic custom-field renderer for the Angular frontend.
- Fetch field definitions based on entity type and `practiceAreaId` when applicable.
- Render the supported data types with existing controls and the repository’s established form conventions.
- Respect `isRequired` and definition ordering.
- Preserve and display inactive historical options while preventing inappropriate new selection.
- Integrate the renderer into the first approved form(s), beginning with Matter create/edit unless the repo’s form layout suggests Client first.
- Map backend validation errors back to the corresponding field controls.
- Add representative tests for the renderer and at least one integrated form case.

### Out of scope

- Creating a full custom-field admin UI beyond the minimal dynamic renderer for the approved forms.
- Replacing all existing form logic with a generic abstraction in unrelated screens.
- Broadly rewriting the Matter or Client flows outside the custom-field integration points.
- Adding a new backend provider or custom-field architecture unrelated to the Phase 15 contract.

## Expected files and modules to change

Likely files and areas:

- Angular form components for Matter create/edit, and possibly Client if the approved path prefers Client first.
- shared frontend custom-field components under [apps/web/src/app/shared](../../apps/web/src/app/shared)
- new or existing service/helpers for fetching custom-field definitions and value payloads
- API client additions for custom-field definition/value endpoints under [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts)
- targeted component tests in the web Jest setup

## Database and migration impact

- This phase should not add database changes by itself.
- It depends on the backend custom-field schema created in Phase 15.
- The frontend must assume definitions/options can be inactive and historical values can still be rendered, so it must not treat “active-only” as the only valid state for editing existing records.

## API and contract impact

Expected new contract behavior:

- a `custom-field definitions` endpoint keyed by entity type and practice area when applicable;
- a value read/write contract using the typed backend model from Phase 15;
- validation errors surfaced in a shape compatible with existing form handling and backend API conventions.

The frontend should handle these as data-driven metadata rather than hard-code per-field mappings.

## Frontend impact

### Reusable renderer

The renderer should support:

- TEXT, TEXTAREA, INTEGER, DECIMAL, MONEY, DATE, DATETIME, BOOLEAN
- SINGLE_SELECT, MULTI_SELECT, PARTY_REFERENCE, CLIENT_REFERENCE, USER_REFERENCE

### Integration path

The first integration is expected in the Matter form because it already has practice-area-scoped data and a natural place for domain-specific fields, but this is not fixed if the repo’s form readiness suggests Client first.

### Form behavior

- field order from definition metadata
- required indicator from `isRequired`
- validation errors surfaced to the relevant control
- historical inactive options visible when editing an existing value, but not as newly selected defaults unless still valid

## Compatibility and data-safety risks

- Failing to keep the backend authoritative would allow incorrect values to be sent to the server and undermine the Phase 15 validation work.
- If the frontend shows inactive option values without preserving the existing record context, it may create impossible or misleading states.
- Dynamic rendering can look generic but must still respect per-entity and practice-area scoping, or it will leak fields beyond the current context.

## Test and verification strategy

Add targeted tests covering:

1. one representative text input and one numeric input renderer;
2. single-select and multi-select rendering with inactive historical options;
3. required-field handling and ordering;
4. Matter form integration with PracticeArea-driven definitions;
5. backend validation error mapping back to the correct controls.

Verification after implementation:

- run the most relevant Angular/Jest test targets for the web app custom-field unit/integration tests;
- run a targeted build or type-check if the renderer introduces new shared form primitives;
- record exact command outputs in [delivery/16-custom-fields-frontend/verification.md](./verification.md).

## Decisions requiring approval

- Bind the first integrated form to Matter create/edit unless repository form readiness suggests Client is the better first target.
- Use a single reusable dynamic-renderer pattern rather than special-case field components per type.
- Keep the backend authoritative for validation and only surface user-facing guidance from the API response.

## Completion gate

This phase is complete when office-specific fields can be rendered from metadata and mapped into form values without hard-coded, per-field handlers.
