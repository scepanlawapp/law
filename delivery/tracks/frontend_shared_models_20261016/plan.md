# Plan

- [x] Convert `@law/api-interfaces` literal unions to enum-like const objects (+ `enumOf` for array-backed unions)
- [x] Add `shared/models` (select-option, labels, sort, locale) and `LocalizationService.locale()`
- [x] Remove duplicated locale/select helpers (`timeLocale`, `numberLocale`, `shared/utils/select-options.ts`, work-entry label keys)
- [x] Default page size 100 + `FIRST_PAGE`
- [x] Migrate features: assistant/layout/core/shared UI
- [x] Migrate features: time, finance work review/retainers/month-end
- [x] Migrate features: finance invoices/payments/price sources
- [x] Migrate features: documents, settings
- [x] Migrate features: clients, cases, dashboard
- [x] Migrate features: work management, calendar, revenue sharing, reports
- [x] Move frontend DTOs from `@law/api-clients` into `@law/api-interfaces`
- [x] Merge new SR/EN translation keys
- [x] Record organization rules for agents
- [x] Type-check, lint, focused tests

Verification: API `tsc` and web `ngc` clean; ESLint 0 errors on changed files; web Jest 853/860 (the 7 failures are the pre-existing `calendar.component.spec` and `finance-statement-create.component.spec`); API MFA + work-entry Jest 284/284. Browser verification not run.
