# Organization and Invoicing Settings Implementation Plan

- [x] Create and register the delivery track; create the matching implementation branch before application code changes.
- [x] Inspect the existing Prisma workspace/invoice models, feature-module conventions, invoice suggestion/save logic, API clients, settings routes/forms, translations, and installed Spartan/UI APIs.
- [x] Add typed shared contracts for organization settings, section updates, bank accounts, and numbering enums.
- [x] Add Prisma models, enums, relations, constraints, and a new migration for organization settings, bank accounts, and invoice sequence state; update demo seed behavior where required.
- [x] Implement workspace-scoped organization-settings DTO validation, defaults, service, controller, module, and secure SEF API-key replace/remove operations.
- [x] Implement and unit-test the dedicated invoice-numbering service for pattern validation, rendering, parsing, period keys, suggestions, and saved-number synchronization.
- [x] Integrate invoice-number suggestion and successful save paths with configured numbering and sequence state while preserving uniqueness checks. The prior code only auto-allocated `INV-*`; this track adds the requested suggestion endpoint and composer action while retaining automatic fallback.
- [x] Add shared frontend API clients for section updates, SEF credentials, and bank-account operations.
- [x] Convert Workspace settings into a child-route layout and preserve the existing general-preferences form unchanged under General.
- [x] Implement localized Company, Tax, SEF/attachments, Numbering, Payments/bank accounts, Currencies, and Invoice defaults forms using installed Spartan/UI components.
- [x] Add focused backend and frontend tests for defaults/workspace scoping, secret masking/replacement/removal, numbering validation/rendering/reset/suggestion behavior, composer compatibility, and live-preview token rendering.
- [x] Update `.github/bussiness-logic-done-so-far.md`, complete track status, and run targeted lint, tests, Prisma validation/generation, and builds.

## Verification results

- `npx prisma validate --schema apps/api/prisma/schema.prisma` — passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx build api --skip-nx-cache` — passed.
- `NG_BUILD_MAX_WORKERS=1 NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx build web --configuration=development --skip-nx-cache` — passed.
- The production web build reaches Angular bundling but cannot inline the repository's existing Google Material Icons stylesheet because this environment cannot resolve `fonts.googleapis.com`; the development build and standalone Angular compiler both pass.
- `npx nx test api --runInBand --testPathPatterns='(invoice-numbering|organization-settings)\\.service\\.spec\\.ts'` — 2 suites / 15 tests passed.
- `npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts` — 1 suite / 26 tests passed.
- `npx nx test web --runInBand --testPathPatterns='(finance-invoice-create|organization-settings-sections)\\.component\\.spec\\.ts'` — 2 suites / 7 tests passed.
- `./node_modules/.bin/ngc -p apps/web/tsconfig.app.json` — passed without diagnostics after pruning unused standalone imports.
- API lint passed with five pre-existing warnings. Web lint remains blocked by two pre-existing errors in `matter-link.component.ts` and `sidebar.component.html`; neither file is part of this track.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
