# Implementation Plan

- [x] Create delivery branch, track files, and delivery index link.
- [x] Generate missing Helm pagination from installed CLI and inspect exported API.
- [x] Implement finance-invoice pagination and immediately run focused tests.
- [x] Audit all frontend page-change controls and migrate eligible surfaces; preserve excluded flows.
- [x] Run focused regression tests, web lint/build, and available desktop/mobile browser checks.
- [x] Update business logic documentation and record completion/results.

## Implementation

- Branch/track: `frontend_numbered_pagination_20261009`; no commits, dependency upgrades, database changes, or additional servers.
- Generated only the missing Helm pagination library using installed CLI 1.4.1. Existing button/select/utils families were reused. Added only its path alias and corrected generated peer dependencies.
- Ten paginator groups across seven components: clients; cases-list; documents; finance-invoices; invoice-line-import-dialog; past-events; case-detail (activities, responsibilities, sessions, drafts). Shared application wrapper supplies translations, not query-state management.
- Query variant is used for the existing URL-owned case list with configurable `casePage`; size is stored in `casePageSize`. Nested/local lists and dialogs use the controlled non-query variant. The assistant API supports one shared size for both linked lists.
- Generated source was adapted for semantic text, SR/EN labels, accessible real local buttons, responsive layout, disabled states, and pure page-link calculation. It does not emit corrections from a computed signal against stale server totals; owners reset/clamp and guard their own requests.
- Unchanged: team-time infinite scroll (25), finance-work-review infinite scroll (25), work-view incremental loading, My time's weekly page aggregation, assistant session loading, notifications, all option/reference lookup sizes, document version requests and overview previews, calendar/week/period navigation and tab-overflow arrows.

## Verification

- `NX_DAEMON=false npx --no-install nx g @spartan-ng/cli:ui pagination --interactive=false`: generated successfully; no installation/upgrade.
- Immediately after first invoice edit: `nx test web --runInBand --testPathPatterns=finance-invoices.component.spec.ts`: 2/2 passed.
- Final focused `nx test web --runInBand --testPathPatterns='pagination.component|finance-invoices.component|invoice-line-import-dialog.component|documents.component|past-events.component|case-detail-activity-duration'`: 6 suites, 74 tests passed. Covers defaults, totals, reset/filtering, request counts, URL isolation, stale responses, clamping and preserved selections.
- Expanded parent/exclusion regression run additionally includes client-detail, my-time, team-time, finance-work-review and work-view: 10 suites/109 tests passed, 1 suite/7 tests failed. All failures are the unchanged My time `PastEventsStub` lacking the existing `collapsibleSidebar` input; `git show HEAD` confirms the mismatch existed before this track. Not repaired outside scope.
- `npx --no-install playwright test --config=apps/web-e2e/playwright.config.mts --project=chromium apps/web-e2e/src/pagination.spec.ts --workers=1 --reporter=line`: 8/8 passed against existing `http://localhost:4200`. Clients/cases/documents/invoices at 1440x960 (EN, ivory) and 390x844 (SR, charcoal). Verified default 50, numbered/Next links, ellipsis, totals, 20-item reset, search reset, preserved query parameters, exact list request counts, and no pagination overflow/page errors. Inspected desktop/mobile screenshots under `dist/.playwright/apps/web-e2e/test-output/pagination-*/{pagination,page}.png`.
- Browser fixtures mock authenticated API responses, using the existing E2E pattern, and do not mutate demo data. Dialog and case-tab changes are unit/template-compiler verified; not independently browser exercised. Firefox/WebKit not run.
- `npx --no-install ngc -p apps/web/tsconfig.app.json --noEmit`: passed.
- `nx lint pagination`: passed after correcting generated peers. `nx lint web-e2e`: passes with warnings (fixture conditionals/non-null assertions and existing document tests).
- `nx lint web`: blocked by three pre-existing errors: assistant matter-link component selector, infinite-scroll directive selector, and invoice-import template `entry.value != null`. Existing client-detail non-null warning remains. Introduced empty-method lint errors were fixed. Baseline source confirmed with `git show HEAD`.
- `nx build web --configuration=development`: passed, including pagination library and dependencies.
- `nx build web` (production): Angular compilation/bundling succeeded but final budget gate failed: initial bundle 2.38 MB exceeds unchanged 1.75 MB error budget by 632.04 kB. Also reports existing assistant-style budget and CommonJS warnings. No budgets were increased; baseline bundle size was not separately built.
- `git diff --check`: passed. Lockfile, installed versions, backend and excluded implementation files unchanged.
- Editor Angular diagnostics may retain unresolved symbols for the newly generated alias despite successful CLI compilation and browser execution; reload the language service/window if those stale diagnostics persist.

Implementation complete with the above external gate/test-harness caveats; not a claim that all repository-wide gates pass.
