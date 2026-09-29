# Billing Statement Edit, Delete, and Detail Routing Plan

- [x] Create the implementation branch and register the delivery track before application changes.
- [x] Inspect current statement contracts, persistence rules, routes, confirmation patterns, and tests.
- [x] Add workspace-scoped draft statement update and delete API behavior with shared contracts and focused tests.
- [x] Reuse the statement composer in edit mode, loading the route statement and prefilling the form.
- [x] Add localized list actions, guarded deletion, and accessible row navigation.
- [x] Add the placeholder statement detail component and route ordering.
- [x] Update the implemented-business behavior documentation.
- [x] Run focused format, lint, type-check, test, build, and UI verification.
- [x] Mark the track complete and record verification results.

## Verification

- `npx prettier --write` on changed implementation, localization, business-logic, and track files (passed).
- `git diff --check` (passed).
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` (passed).
- `npx tsc -p apps/api/tsconfig.app.json --noEmit` (passed).
- `npx eslint apps/web/src/app/features/finance-statements/*.ts libs/api/features/financials/src/lib/financials.controller.ts libs/api/features/financials/src/lib/financials.service.ts apps/api/src/app/financials.service.spec.ts` (passed with eight pre-existing `no-explicit-any` warnings in `financials.service.ts`; no errors).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts --output-style=static` (10 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (4 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build api --output-style=static` (passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static` (passed outside the sandbox, including Angular template compilation).
- A live browser pass was attempted after starting the local services, but both Nx serve targets reported that another Nx process held the target and did not bind ports 3001/4200; no runtime visual result is claimed.
