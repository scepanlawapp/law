# Header Quick Actions Implementation Plan

- [x] Create and register this delivery track as a child of the work-tracking UX track.
- [x] Inject the existing task and event dialog services into the global header.
- [x] Add localized create-task and create-event buttons beside create work.
- [x] Add focused unit coverage for the header dialog actions.
- [x] Run targeted formatting, tests, and web build verification.
- [x] Update the business-logic source of truth and mark this track completed.

## Verification results

- `npx prettier --check` for the changed header and delivery-track files — passed after formatting.
- `NX_DAEMON=false NX_TUI=false npx nx test web --runInBand --testPathPatterns=apps/web/src/app/layout/header/header.component.spec.ts` — 1 suite / 3 tests passed.
- `NX_DAEMON=false NX_TUI=false npx nx build web --configuration=development --skip-nx-cache` — passed.
- The production build compiled the application and then failed only on the pre-existing initial-bundle budget: 2.12 MB against the 1.75 MB error threshold. Existing assistant stylesheet and CommonJS warnings remain unchanged.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
