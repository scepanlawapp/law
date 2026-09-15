# Implementation Plan

See [spec.md](./spec.md) for requirements and acceptance criteria.

Status: Complete. All implementation phases and acceptance checks are finished; responsive and theme presentation was verified by the user in the running application.

## Phase 1 — Responsive assistant shell

1. Generate the missing Spartan/UI `sheet` Helm library with the repository's Nx generator and existing `components.json` configuration.
2. Refactor `assistant.component.html` into explicit desktop conversation navigation, chat header and mobile controls, scrollable transcript, optional review workspace, and stable composer regions.
3. Add parent-owned Angular signals for mobile conversation-sheet visibility and draft-review expansion.
4. Track the last loaded draft ID so a different draft opens automatically while a manual collapse remains effective for the same draft.
5. Clear draft expansion identity when the selected conversation has no draft or is deleted.
6. Close the mobile conversation sheet after session selection.
7. Add the required Lucide icons and Spartan imports without changing business-service dependencies.

## Phase 2 — Assistant visual hierarchy

1. Implement a desktop conversation-sidebar and central-workspace grid with explicit min-size and overflow constraints.
2. Within the central workspace, allocate chat plus a clamped review pane when expanded and a narrow review rail when collapsed.
3. Add responsive breakpoints that replace the fixed conversation sidebar with a mobile sheet and prevent the review workspace from squeezing chat on narrow screens.
4. Style conversation headings, search, grouped date labels, selected state, timestamps, loading feedback, and empty results with semantic tokens.
5. Constrain transcript content for reading and distinguish user and assistant messages using token-driven surfaces, avatars, metadata, and attachment links.
6. Add deliberate empty-chat, classifying, and error states using existing assistant copy and localized additions.
7. Style pending files as removable compact chips and frame the composer as a stable responsive input surface.
8. Preserve all existing send, keyboard, upload, drag-and-drop, paste, speech, and scrolling behavior.

## Phase 3 — Collapsible draft review workspace

1. Add a controlled expanded input and change output to `DraftReviewPanelComponent`.
2. Add a single accessible expand/collapse control with a stable controlled-region ID, localized label, tooltip, and `aria-expanded` state.
3. Recompose the panel into a fixed header, scrollable content region, and stable action footer.
4. Keep a compact, recognizable review rail or header visible in the collapsed state.
5. Map every `DraftApprovalStatus` to translated display copy and semantic status treatment.
6. Present warnings and missing fields as distinct, readable semantic blocks.
7. Restyle script selection as a segmented Latin/Cyrillic control.
8. Build a document-oriented editor surface and a visibly labeled reviewer-note field.
9. Group download and save as document utilities; group request changes, reject, and approve as workflow decisions.
10. Use Lucide icons where they improve scanning and tooltips for icon-only controls.

## Phase 4 — Localization and focused tests

1. Add matching English and Serbian keys for mobile conversation navigation, draft expansion, empty and loading states, review field labels, and every approval status.
2. Add a `DraftReviewPanelComponent` spec covering expanded and collapsed rendering, ARIA state, value retention across collapse, script output, and action outputs.
3. Add an `AssistantComponent` spec with mocked API, authentication, speech, dialog, and toast dependencies.
4. Cover selected-session presentation state, automatic opening for a new draft, retained collapse for the same draft, no-draft cleanup, and mobile-sheet closure after selection.

## Phase 5 — Verification

1. Run the two focused Jest specs with the web Jest configuration.
2. Run `npx nx test web`.
3. Run `npx nx lint web`.
4. Run `npx nx build web --configuration=development` and confirm generated sheet dependencies resolve and component styles remain within configured budgets.
5. Start the existing web development server and inspect `/assistant` near 1440 px, 1024 px, and 390 px widths.
6. Verify empty chat, populated chat, classifying, error, pending attachments, warnings, missing fields, all approval statuses, and long draft content.
7. Confirm collapse retains unsaved editor and note content, while loading a different draft opens the workspace.
8. Keyboard-test the conversation sheet, session controls, review toggle, script choices, workflow actions, Escape dismissal, and visible focus.
9. Verify at least the ivory and one dark theme with two accent selections.

## Expected files

- `apps/web/src/app/features/assistant/assistant.component.ts`
- `apps/web/src/app/features/assistant/assistant.component.html`
- `apps/web/src/app/features/assistant/assistant.component.scss`
- `apps/web/src/app/features/assistant/assistant.component.spec.ts`
- `apps/web/src/app/features/assistant/components/draft-review-panel/draft-review-panel.ts`
- `apps/web/src/app/features/assistant/components/draft-review-panel/draft-review-panel.html`
- `apps/web/src/app/features/assistant/components/draft-review-panel/draft-review-panel.scss`
- `apps/web/src/app/features/assistant/components/draft-review-panel/draft-review-panel.spec.ts`
- `apps/web/public/i18n/eng.json`
- `apps/web/public/i18n/ser.json`
- `libs/shared/frontend/ui/sheet/`

## Delivery notes

- Keep changes scoped to assistant presentation, responsive behavior, accessibility, localization, and local UI state.
- Do not alter shared API contracts or backend behavior.
- Use the generated Spartan sheet rather than implementing custom overlay or focus management.
- Prefer component-scoped styles and existing semantic tokens; no global palette redesign is part of this track.