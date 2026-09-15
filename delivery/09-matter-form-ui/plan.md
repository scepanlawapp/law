# Phase 09 — Matter create and edit frontend

## Overview

This phase implements the Matter create/edit UX in the Angular app using the repository’s existing form and API conventions. The repo already contains the backend-side Matter model and draft/open logic, so the front-end work should stay additive and explicitly reuse the current `Matter` API contract instead of introducing a parallel client abstraction.

No blocking questions.

## Repository findings relevant to this phase

- The active Matter API already exists in [libs/api/features/matters/src/lib/matters.service.ts](../../libs/api/features/matters/src/lib/matters.service.ts) and [libs/api/features/matters/src/lib/matters.dto.ts](../../libs/api/features/matters/src/lib/matters.dto.ts). It supports draft creation, opening, and update flows with repository-specific `DRAFT`/`OPEN` status validation.
- The active tenant schema already has `Matter`, `MatterClient`, `MatterParticipant`, `MatterParticipantRole`, `Proceeding`, `PracticeArea`, `MatterStage`, `ParticipantRole`, and `ProceedingType` in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- The repo’s lookup API already exposes `practiceAreas`, `matterStages`, `participantRoles`, and `proceedingTypes` via the `ReferencesService` pattern in [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts).
- The current frontend analog is the legacy `Case` form in [apps/web/src/app/features/cases/case-form.component.ts](../../apps/web/src/app/features/cases/case-form.component.ts) and [apps/web/src/app/features/cases/case-form.component.html](../../apps/web/src/app/features/cases/case-form.component.html). It is the closest UX template for field ordering, select behavior, and the repository’s Angular form conventions.
- The repo still uses the legacy Client/Case runtime in parallel with the legal-domain Matter model; the frontend should respect the compatibility-first requirement and not rewrite the existing app architecture.

## Scope

### In scope

- Create a Matter form for create/edit UX using the existing Angular conventions.
- Use `Title` as a text input.
- Use multi-autocomplete for `Clients` and the approved primary Client behavior when the design is confirmed.
- Provide a minimal, reusable client-creation flow from the Matter form if the product needs it.
- Use searchable selects for `Practice area` and `Stage`.
- Use an appropriate enum control for `Priority`.
- Use autocomplete for `Responsible user`.
- Use a date picker for `Opened date` and a textarea for `Description`.
- Add secondary sections for `Participants` and `Proceedings` with add/edit/remove UX appropriate to the current screen architecture.
- Implement `Save draft` and `Open matter` actions that rely on backend validation.
- Add form UX validation and targeted frontend tests.

### Out of scope

- Rewriting the API or migration model for a new Matter architecture.
- Broad refactors to the case/client legacy stack outside the Matter form UX.
- Adding a parallel matter management subsystem or a new state store if the existing API contract is sufficient.
- New database migrations unless a missing field/value is discovered and required by actual UI/API integration.

## Expected files and modules to change

- [apps/web/src/app/app.routes.ts](../../apps/web/src/app/app.routes.ts) for Matter routes if the app does not already expose them under a Matter feature area.
- A new Matter feature form screen under [apps/web/src/app/features](../../apps/web/src/app/features), likely mirroring the current client/case pattern.
- Shared frontend API client additions in [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts) if `Matter` client methods are not yet present.
- Existing matter-specific backend contract files only if the UI reveals a contract gap or missing transformation for `clientIds`, `practiceAreaId`, `stageId`, `responsibleUserId`, `openedAt`, and status transitions.
- Focused frontend tests under the web app for creation, validation, and open/draft behaviors.

## Database and migration impact

- No destructive migration is expected for this phase.
- The schema already contains the core Matter/Proceeding / lookup structure, so the main work is UI integration rather than schema change.
- If a backend gap is discovered during the implementation window, it should be treated as a minimal additive fix, not a rewrite of the existing compatibility layer.
- Data safety remains the same as the repo rules: preserve existing legacy Client/Case data, avoid placeholder business values, and keep tenant-scoped validation authoritative.

## API and contract impact

- The frontend should reuse the repo’s existing Matter API contract rather than inventing a separate client shape.
- The expected backend rules are:
  - `title` required for draft creation;
  - `title` and at least one active Client required before the `Open` transition;
  - `responsibleUserId` must be a valid workspace member with the allowed role;
  - `practiceAreaId`, `stageId`, and related IDs must resolve within the tenant scope.
- If the UI needs a `primaryClientId` or additional relationship metadata, that should be confirmed before implementation because it affects the product contract and not only the form markup.

## Frontend impact

- Use the existing Angular + Spartan/Helm form conventions already used by the client and case forms.
- Prefer searchable selects and autocompletes instead of raw dropdowns for large entity sets.
- Keep the form in sections with progressive disclosure: core matter details, client selection, participant/proceeding sections, and action controls.
- `Save draft` and `Open matter` should remain explicit actions that call the backend and surface server-side validation errors rather than trying to duplicate business rules in the browser.

## Compatibility and data-safety risks

- The repository still contains a legacy `Case`/`Client` runtime and a parallel legal-domain `Matter` model, so the UI must not assume a single “client per matter” or single-proceeding pattern.
- The main UX risk is broadening into a full matter workspace redesign instead of a focused create/edit form.
- Cross-tenant leakage risk is low if the frontend continues to consume workspace-scoped API responses and the backend maintains validation, but it must remain explicitly guarded during implementation.
- The `primary Client` behavior is a product decision that could materially affect the UI contract; it should be explicitly approved before implementation if the matter form will expose this behavior as a user control.

## Test and verification strategy

1. Add or update focused frontend tests for the Matter form fields and validation states.
2. Add tests for the two user flows that matter most: draft save and open matter.
3. Verify the form respects required field rules and handles at least one invalid server response path.
4. Run the smallest relevant Nx/Jest check for the web app and record exact output in the delivery verification artifact.
5. If a backend contract gap is discovered during testing, fix it with the smallest additive change and re-run the targeted verification.

## Decisions that require approval

- Whether the Matter form should expose an explicit primary Client selector or a default-first-client pattern.
- Whether the product wants only a minimal Matter create/edit form in this phase or a fuller secondary participant/proceeding editing experience on the same page.
- Whether the UI should include the optional “Create new client” shortcut from the multi-autocomplete as a minimal workflow or defer it to a later form pass.

## Completion gate

This phase is complete when a user can create a Draft or Open Matter with multiple Clients and optional participant/proceeding sections using the approved Matter API contract and the form reflects the required validation and lifecycle rules.
