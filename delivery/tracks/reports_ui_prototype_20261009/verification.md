# Verification

- Angular template/type compilation: `node node_modules/@angular/compiler-cli/bundles/src/bin/ngc.js -p apps/web/tsconfig.app.json --noEmit` passed.
- Reports and sidebar Jest tests: `nx test web --runInBand --testPathPatterns='reports|sidebar'` passed (34 tests, six suites), including existing profitability tests.
- Changed frontend and browser-test files pass their respective project ESLint configurations.
- `nx build web --configuration development` passed. The prototype is a lazy-loaded route chunk; no new runtime dependency was added.
- Six Chromium Playwright checks passed in `apps/web-e2e/src/reports-prototype.spec.ts` cover all routes, period and entity filters, invalid/empty states, chart tooltips, keyboard menu toggling, sorting, allocation drilldown, personal scoping, collapsed/mobile navigation, and real appearance-settings language switching. API mocking is test-only; reports make no finance requests or writes. Explicit October 2026 ranges keep fixture checks deterministic without freezing browser animation clocks.
- Visually inspected overview, earnings, outstanding, personal and attorney detail screens on desktop, plus mobile KPI layouts and navigation. Verified token changes across midnight, deep-navy, charcoal, dark-teal, burgundy and ivory. Browser inspection found no page errors or document overflow.

## Existing lint limitations

The full `nx lint web` target still fails on unchanged files: `features/assistant/matter-link.component.ts:43` has a selector-prefix error; `features/finance-invoices/invoice-line-import-dialog.component.html:184` uses `!=`. `features/clients/client-detail.component.ts:121` also has an existing non-null-assertion warning. These are outside this prototype.

## Prototype boundary

All 120 records are fictional frontend fixtures for 2026. Work/invoice bases select a cohort with collections through the range end; collection basis selects payments in the range. Outstanding potential uses linked-invoice cumulative collections, with half-up minor-unit allocation rounding. Missing rules are visible and excluded from eligible distribution. The individual data projection removes other beneficiaries before aggregation. Fixtures contain no actual financial data; production API authorization and financial integration remain a separate delivery. Export is deferred; no inactive export action is shown.
