# Calendar Workspace UI Implementation Plan

- [x] Verify current calendar route, placeholder page, contracts, endpoints, and installed UI dependencies.
- [x] Create delivery track artifacts.
- [x] Add typed Calendar API client and query boundary.
- [x] Implement URL-synchronized calendar state and range loading.
- [x] Implement Spartan/UI toolbar, filters, and create-action unavailable states.
- [x] Implement responsive Month, Week, and Agenda views.
- [x] Implement day agenda and source-specific details interaction.
- [~] Add Event create/change dialog and event cancellation action using real endpoints.
- [ ] Add translations and focused component/API-client tests.
- [ ] Run affected web tests and uncached web build.

## Current verified gaps

- No frontend Event, Task, or Deadline API clients/forms existed at track start.
- No calendar package is installed; the grid is custom Angular markup.
- Backend calendar continuation currently exposes `nextCursor` but does not accept a cursor input, so the UI must show incomplete range state instead of pretending to have complete pagination.

## Implemented checkpoint

- Replaced the placeholder Calendar page with a real typed `/calendar` integration.
- Added Monday-first six-week Month grid, Agenda rendering, responsive default view selection, URL state for date/view/search/source/completed visibility, range navigation, loading/error/empty states, and an honest incomplete-range banner.
- Added source filtering, completed/cancelled visibility filtering, stable date-only/timed ordering, today highlighting, adjacent-month styling, and an accessible selected-item details panel.
- Added English and Serbian translations and a typed `CalendarApiClient`.
- The current backend receives only the compatible bounded range query. Source/status filters are intentionally applied locally because the existing endpoint does not accept the shared `CalendarSourceType` values consistently across its aggregated sources.

## Verification

- Workspace diagnostics: no errors in the Calendar component, template, or API client.
- `CI=1 NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false npx nx build web --skip-nx-cache` — frontend templates and TypeScript compiled, but the command exited 1 on existing bundle budgets: initial bundle exceeded by 190.29 kB and `assistant.component.scss` exceeded by 2.35 kB. No Calendar-specific build error was reported.

## Remaining

- Week time-grid view currently shares the month branch and needs the dedicated all-day/hour layout.
- Create dialogs and source-specific edit/status integrations are not yet connected because no frontend Event/Task/Deadline forms or API clients existed.
- Backend cursor consumption must be added before exact visible-range counts, `+N more`, and incremental Agenda/day loading can be presented as complete.

## Layout and scrolling checkpoint

- The page now uses a two-pane layout: a left mini-month calendar and a scrollable calendar surface on the right.
- Selecting a day in the mini-month sets that day as the anchor and switches the main view to its Monday-first week.
- Week is now the default view, including when no URL view is provided.
- Agenda retains the translated empty state; Month and Week continue to render their calendar structure even when no records are returned.
- The Week schedule has a bounded vertical scroll viewport and positions the initial scroll near the current hour after loading. The current hour is used as the anchor, with one preceding hour visible for context.
- No Spartan calendar primitive is installed in the current workspace, so the mini-month uses project tokens and existing Spartan buttons while preserving the same component boundary.

## Latest verification

- Calendar component and template diagnostics: clean.
- Web build: no Calendar-specific errors; exits 1 on existing initial-bundle and `assistant.component.scss` budget failures.

## Interaction checkpoint

- Removed the frontend empty-state branch; the calendar grid and agenda remain visible when there are no records.
- Double-clicking an empty Month day opens an Event dialog prefilled for that date.
- Double-clicking an empty Week hour opens the same dialog prefilled for the selected date and hour.
- Right-clicking an Event selects it and exposes Change and Delete actions in the event action menu.
- Change uses the existing Event update endpoint. Delete uses the existing supported cancel endpoint after confirmation; unrestricted hard deletion is not available in the backend contract.
- Event creation/change uses a real typed API client and refreshes the visible calendar range after success.

## Latest verification

- Workspace diagnostics are clean for the Calendar component, template, Event dialog, and API client.
- Web build exits 1 only on existing budget failures: initial bundle 1.20 MB over the 1.00 MB budget and `assistant.component.scss` 10.35 kB over the 8.00 kB budget. No Calendar-specific compilation errors were reported.
