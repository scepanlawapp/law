# Billing Statement Basic Detail UI Plan

- [x] Create the implementation branch and register the child delivery track before application changes.
- [x] Inspect the statement list, composer, route, API client, detail DTOs, existing detail/loading patterns, Helm exports, and Serbian translations.
- [x] Implement the dedicated read-only statement detail component using the existing API and model.
- [x] Keep list-to-detail navigation on the statement-number link and remove implicit row navigation.
- [x] Add or adjust only the localized detail-page copy required by the basic view.
- [x] Update implemented-business documentation.
- [x] Run focused formatting, lint, TypeScript, tests, build, and practical UI verification where available.
- [x] Mark the delivery track complete with verification results.

## Verification

- `npx prettier --write` on changed statement detail/list, localization, business-logic, index, and track files (passed).
- `git diff --check` (passed).
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` (passed).
- `npx eslint apps/web/src/app/features/finance-statements/*.ts` (passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (4 tests passed, preserving create/import helper behavior).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static` (passed outside the sandbox, including Angular template compilation).
- A live browser pass was attempted, but `api:serve:development` remained held by another Nx process and did not bind port 3001; no runtime visual result is claimed.
