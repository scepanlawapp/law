# Billing Statement Reactive Totals Plan

- [x] Create the implementation branch and register the child delivery track.
- [x] Add focused pure calculation helpers and tests for each supported row-edit direction, rounding, and zero/invalid handling.
- [x] Wire every manual, imported, and loaded row into loop-safe reactive recalculation.
- [x] Derive statement net, VAT, and gross totals from rows and keep save payloads synchronized without changing API contracts.
- [x] Move the compact invoice summary and comment below the table and remove the old footer total/header amount fields.
- [x] Update translations and implemented-business documentation.
- [x] Run focused formatting, lint, type checking, tests, and Angular build.
- [x] Record verification results and mark the track complete.
- [x] Align the read-only statement detail layout with the revised create/edit invoice hierarchy.
- [x] Remove duplicated detail totals and the old gross-only footer, then add the compact invoice summary and move the comment beneath it.
- [x] Re-run focused formatting, Angular type checking, and the web build for the detail-layout follow-up.
- [x] Record follow-up verification and mark the track complete again.
- [x] Replace the invoice-lines section's detached header and nested panels with one compact toolbar/table data region.
- [x] Preserve the disabled import guidance while emphasizing manual line creation as the primary available action.
- [x] Re-run focused formatting, Angular type checking, and the web build for the toolbar follow-up.
- [x] Record toolbar verification and mark the track complete again.

## Verification

- Focused Prettier formatting (passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (10 tests passed).
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` (passed).
- Focused ESLint on finance-statement TypeScript files (passed with no warnings or errors).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static` (passed outside the sandbox, including Angular template compilation).
- JSON parsing for both translation catalogs and delivery metadata (passed).
- `git diff --check` (passed).
- Live browser verification was attempted against the running local web/API services, but browser-use policy blocked access to the authenticated legal application because it could expose sensitive client/invoice data; no visual runtime result is claimed.
- Detail-layout follow-up: focused Prettier formatting and `git diff --check` passed.
- Detail-layout follow-up: `npx tsc -p apps/web/tsconfig.app.json --noEmit` passed.
- Detail-layout follow-up: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static --verbose` passed outside the sandbox, including Angular template compilation.
- Toolbar follow-up: focused Prettier formatting and `git diff --check` passed.
- Toolbar follow-up: `npx tsc -p apps/web/tsconfig.app.json --noEmit` passed.
- Toolbar follow-up: `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static --verbose` passed outside the sandbox, including Angular template compilation.
