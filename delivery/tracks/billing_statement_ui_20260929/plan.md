# Billing Statement UI Plan

- [x] Create the implementation branch and register the delivery track before application changes.
- [x] Add existing-backend statement request contracts and API-client methods.
- [x] Add statement list and create routes plus finance navigation.
- [x] Implement the filtered and paginated statement list using existing UI states and table patterns.
- [x] Implement the create shell, breadcrumb, typed header form, and typed line `FormArray`.
- [x] Implement manual line creation/removal and source-reference detachment on client change.
- [x] Implement the service-driven import dialog with client-scoped, paginated `UNBILLED` lines and duplicate prevention.
- [x] Add currency mismatch validation, row indicators, warning banner, and blocking save state.
- [x] Map edited/imported/manual rows to existing line and statement endpoints.
- [x] Add focused tests for mapping, detachment, duplicate prevention, and currency validation.
- [x] Update localization and implemented-business documentation.
- [x] Run targeted formatting, tests, lint, and web build; fix introduced issues.
- [x] Complete the delivery track.

## Verification

- `npx prettier --write` on all changed source, translation, and track files.
- `npx eslint` on the new finance feature and changed shared/frontend sources.
- `npx tsc -p apps/web/tsconfig.app.json --noEmit`.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (4 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static` (passed outside the sandbox; only two pre-existing `NG8102` warnings remain in `draft-review-panel.html`).
