# Calendar Deadlines Visible Plan

- [x] Trace the calendar API contract, backend aggregation, frontend query, filters, and render paths.
- [x] Create and register the delivery track before changing application code.
- [x] Update the visible-range request so events and deadlines are loaded.
- [x] Render timed deadlines in the week grid as short point-in-time blocks.
- [x] Add focused regression tests for the requested source types and timed-deadline layout.
- [x] Run targeted Calendar tests and the relevant web verification target.
- [x] Update business-logic documentation and complete the delivery track.
- [x] Add translated Calendar actions for creating an obligation and a deadline.
- [x] Open the reusable deadline dialog with the selected date and refresh after save.
- [x] Add focused interaction coverage and rerun Calendar verification.
- [x] Update business-logic documentation and return the delivery track to completed.
- [x] Replace non-actionable week date buttons with header elements.
- [x] Make the week header row sticky within the existing schedule viewport.
- [x] Verify formatting, Calendar tests, and the web build.
- [x] Document the layout behavior and return the track to completed.
- [x] Load tasks alongside events and deadlines for the visible range.
- [x] Group task/deadline due targets into the sticky week header by Belgrade calendar day.
- [x] Add one-line obligation entries with truncation, red marker, and selection behavior without a redundant tooltip.
- [x] Change the create-task dialog default to no due target without affecting edit mode.
- [x] Update regression coverage, documentation, and verification.

## Verification

- Calendar and due-target Jest specs: 3 suites and 8 tests passed.
- ESLint passed for the changed TypeScript files; the Calendar HTML file is not covered by the direct ESLint configuration.
- Web development build passed.
- Full web lint remains blocked by pre-existing errors outside Calendar in assistant, documents, and sidebar files.
