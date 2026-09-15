# Phase 12 — Matter detail screen

## Overview

This phase refactors the Matter detail workspace around the repository’s additive legal-domain model rather than the old case-centric concept. The repo already has the backend Matter contract and a minimal case-style detail pattern, so the correct approach is to reuse that architecture and add the Matter UI details needed for a compact workspace view and the core tabs the product needs.

No blocking questions.

## Repository findings relevant to this phase

- The active backend Matter API is in [libs/api/features/matters/src/lib/matters.service.ts](../../libs/api/features/matters/src/lib/matters.service.ts) and [libs/api/features/matters/src/lib/matters.dto.ts](../../libs/api/features/matters/src/lib/matters.dto.ts). It supports draft creation, open transition, and update flows and already enforces the rule that a matter must have at least one Client before opening.
- The repo’s legal-domain model clarifies that a Matter is the law office’s internal workspace and can have multiple Clients, participants, and proceedings, not a single-client or single-proceeding workflow; this is described in [docs/legal-domain/04-matter-proceeding (1).md](<../../docs/legal-domain/04-matter-proceeding%20(1).md>).
- The current frontend pattern for detail views is the case detail screen in [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts) and [apps/web/src/app/features/cases/case-detail.component.html](../../apps/web/src/app/features/cases/case-detail.component.html). It is the closest repo example for tabbed detail structure, actions, and loading states.
- The document model in [docs/legal-domain/05-documents (1).md](<../../docs/legal-domain/05-documents%20(1).md>) and the frontend UX spec in [docs/legal-domain/07-frontend-ux (1).md](<../../docs/legal-domain/07-frontend-ux%20(1).md>) reinforce that Matter detail should summarize important status, clients, participants, proceedings, and recent activity—not every underlying database field.

## Scope

### In scope

- Create a compact Matter detail header with internal number, title, state, practice area, priority, primary Client, responsible user, and opened date.
- Implement tabs: Overview, Documents, Participants, Proceedings, and Activity.
- Refine the Overview section to summarize important info, Clients, participants, recent proceedings, recent documents, and recent activity, while keeping it concise.
- Support the Participants tab with add/remove behavior and multiple-role handling using the existing Matter participant model.
- Support the Proceedings tab with the approved create/edit/archive/remove behavior that already matches the repo’s workflow patterns.
- Add loading, empty, error, and responsive states for all asynchronous sections.
- Add targeted frontend tests around the detail screen’s state and tab behavior.

### Out of scope

- Rewriting the backend model or migration plan beyond the current additive Matter architecture.
- Introducing a new parallel “workspace” management system or editing model not already used by the repo.
- Rendering every database field on Overview or creating a giant edit form in the detail screen.
- Broad document/activity backend work beyond the UI contract required for the Matter detail page.

## Expected files and modules to change

- [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts) and [apps/web/src/app/features/cases/case-detail.component.html](../../apps/web/src/app/features/cases/case-detail.component.html) as the closest reference to the target Matter detail UX, if a new Matter detail screen is introduced in the same style.
- A new Matter detail feature module/component under [apps/web/src/app/features](../../apps/web/src/app/features) if the repo does not yet have a dedicated Matter page.
- The shared frontend API client in [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts) if a Matter detail endpoint or typed contract is missing.
- Relevant route additions in [apps/web/src/app/app.routes.ts](../../apps/web/src/app/app.routes.ts) if the Matter detail screen route is not already present.
- Focused web tests for the Matter detail page and its state behavior.

## Database and migration impact

- No destructive migration is expected for this phase.
- The existing schema already includes the matter, participant, and proceeding foundations required by the legal-domain model.
- This phase is read-focused and should stay additive; it should not force a migration or data-shaping effort beyond what the current API contract exposes.
- The repo’s compatibility-first approach remains important: the legacy `Case` runtime still exists, so the Matter detail view should not assume a single-case or single-client structure.

## API and contract impact

- The Matter detail page should consume the repository’s current `Matter` API contract rather than inventing a second matter domain.
- Any UI requirements for `primary Client`, `participants`, or `proceedings` should match the backend contract, not a hypothetical product-only shape.
- The page should rely on backend validations and access control for status, client membership, and participant/proceeding authorization.
- If the detail screen needs a missing endpoint or field, it should be implemented in the smallest additive shape and only when it already aligns with the product contract.

## Frontend impact

- Use the existing Angular + Spartan/Helm patterns already used by the current case and client detail screens.
- Keep the Matter detail page structured as a compact workspace: header + tabs + focused summaries rather than a giant “everything” form.
- The `Overview` page should answer “what is important right now?” without exposing every database field.
- Avoid inventing a new parallel editing system; prefer existing edit-page/modal flows and reuse the repo’s patterns.

## Compatibility and data-safety risks

- The main risk is treating Matter as a single-case/single-client record in the UI, which conflicts with the legal-domain model.
- Another risk is showing incomplete or backend-absent data for documents/participants/proceedings without a proper empty state.
- The page must not leak cross-tenant data or hide/blur authorization boundaries from the backend.
- Because the repo still has legacy code around `Case`, the Matter detail screen must stay intentionally scoped to the new model and not broaden into a case migration refactor.

## Test and verification strategy

1. Add focused component tests for the Matter detail header and tab structure.
2. Add tests for the loading and empty states for document, participant, and proceedings sections.
3. Add tests for the main action wiring where the current API contract supports it, such as open/close/archive or participant/proceeding actions.
4. Run the smallest relevant Nx/Jest web test target and record the exact output in the delivery verification artifact.

## Decisions requiring approval

- Whether the default `Overview` tab should show all clients or only the primary Client summary by default.
- Whether the `Participants` and `Proceedings` sections should be add/edit inline on the same page or routed into existing modal/edit patterns.
- Whether the `Documents` tab should be a live list once document linking is available or a minimal empty placeholder until that backend phase is complete.

## Completion gate

This phase is complete when Matter detail provides a usable workspace that can later accept Tasks, Calendar, Finance, Email, and AI tabs without redesign.
