# Phase 10 — Reusable inline-create lookup UX

## Overview

This phase adds a reusable, non-overengineered inline-create pattern for configurable lookup values used throughout the law practice app. The repo already exposes the lookup-backed API via the `ReferencesService`/`ReferencesController` pattern and uses Spartan/Helm-based UI primitives, so the plan is to keep the solution minimal and repository-native: a shared helper or small component pattern that fits the current form architecture rather than a large generic registry abstraction.

No blocking questions.

## Repository findings relevant to this phase

- The backend lookup API is already in place in [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts) and [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts). It supports the required configurable types: `PracticeArea`, `MatterStage`, `ParticipantRole`, `ProceedingType`, `DocumentCategory`, and `OrganizationRelationshipType`.
- The repo’s frontend conventions use Angular form components and Spartan/Helm select/dialog primitives, as seen in [apps/web/src/app/features/settings/appearance-settings.component.ts](../../apps/web/src/app/features/settings/appearance-settings.component.ts) and the confirm dialog implementation under [apps/web/src/app/shared/ui](../../apps/web/src/app/shared/ui).
- The legal-domain specification explicitly requires searchable selects for configurable lookups and an inline-create UX such as `+ Add "Banking disputes"` after successful creation, with the create modal/popover/drawer pattern staying consistent with the project’s existing UI conventions.
- The repo already keeps lookup values tenant-scoped, deactivated rather than hard-deleted, and backend-authoritative for validation, which is exactly the data-safety model this phase should preserve.

## Scope

### In scope

- Identify the existing searchable select / combobox / popover / dialog patterns that the repo already uses.
- Add a reusable inline-create pattern for the configurable lookup selects used in the law app.
- Support the common user flow: open the list, type a new value, create it, refresh the lookup list, and select the created item.
- Support basic validation and duplicate-name/API error handling.
- Keep the pattern reusable without creating a giant generic abstraction.
- Cover the lookup creation behavior with targeted UI/component tests.

### Out of scope

- Replacing the current lookup backend with a new subsystem.
- Broad refactors to the app’s global state or design system.
- Generic dynamic custom-field authoring beyond the lookup use case in this phase.
- Hard-delete of lookup values or destructive migration work.

## Expected files and modules to change

- Shared frontend UI primitives or utilities under [apps/web/src/app/shared](../../apps/web/src/app/shared) if the pattern is centralized.
- Existing form components that currently use configurable lookup selects, especially the Matter form work planned under [delivery/09-matter-form-ui/plan.md](../09-matter-form-ui/plan.md) once the implementation starts.
- The shared API client in [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts) if the inline-create workflow needs a small typed helper or resource-specific creation method.
- The backend lookup controller/service contract only if the UI reveals gaps in the create flow or the API lacks the required permissions/validation behavior.
- Focused frontend tests under the web project for inline-create submission and duplicate error handling.

## Database and migration impact

- No schema migration is expected for this phase.
- The repository’s current lookup tables and tenant-scoped model already meet the requirements for configurable values.
- The implementation should remain additive and safe: deactivation remains the default behavior and no historical rows should be hard-deleted.
- If the phase reveals a missing lookup type or create route in the backend, the fix should be minimal and additive rather than a new storage model.

## API and contract impact

- Reuse the current `references` endpoints and backend validation contract rather than creating a parallel lookup API.
- The inline-create UX should call the existing create endpoint for each lookup resource, while invalid/duplicate names remain backend-authoritative.
- The frontend should refresh or invalidate the relevant lookup query cache after creation and then select the new item automatically.
- Permission checks should continue to respect `WorkspaceRole.ADMIN` or the existing repository authorization pattern for lookup creation.

## Frontend impact

- Use the repo’s current search/select/popover or dialog conventions rather than introducing a new UI pattern.
- Keep the reusable behavior small: likely a shared helper or lightweight component for a lookup-select-with-create action.
- The pattern should be capable of handling at least the core select case: `practiceArea`, `matterStage`, `participantRole`, and `proceedingType`, with the same shape extending to the other lookup types.
- Validate inline creation errors in the form feedback layer without making the UI overly generic.

## Compatibility and data-safety risks

- The main risk is overengineering a single giant “lookup editor” abstraction that does not fit the repo’s current design system or component model.
- Cross-tenant leakage is not a major implementation risk if the API remains used through the existing workspace-scoped reference endpoints, but that must remain guard-railed during implementation.
- The UI must not silently allow duplicates or invalid values; the backend should remain the final validator.
- If a product team later wants more advanced lookup metadata (order, parent relationships, codes, etc.), this phase should remain minimal and not pre-empt a broader admin/editor design.

## Test and verification strategy

1. Add focused component/integration tests for the reusable lookup-create flow.
2. Test the success path: type a new lookup name, create it, refresh the list, and select it.
3. Test the validation path: duplicate name or rejected create request is surfaced clearly.
4. Test a lookup with the repository’s preference for a small shared control pattern rather than a bespoke component per lookup type.
5. Run the relevant web/Jest verification command and record the exact output in the delivery verification artifact.

## Decisions requiring approval

- Whether the lookup create UI should be implemented as a shared helper/hook pattern or a small reusable component wrapper per select control.
- Whether the initial implementation should cover only the matter-related lookup values or all fully referenced lookup resources in the same pattern.
- Whether the project wants the “+ Add \"<text>\"” action visible on every searchable select or only on those configured for inline creation.

## Completion gate

This phase is complete when configurable lookup creation works consistently and reusably across forms, with the same success/validation flow and without creating a parallel lookup architecture.
