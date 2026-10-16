# Plan

- [x] Add `shared/pagination/paginated-list.ts` (`PageState`, `PaginatedList`, `LocalPagination`, constants) with unit tests
- [x] Switch `law-pagination` to a single `[paginator]` input
- [x] Migrate clients, cases list, case detail, documents
- [x] Migrate finance invoices, invoice-line import dialog, payments
- [x] Migrate past events, team time, work view table
- [x] Migrate append lists: finance work review, event/task work entries
- [x] Update specs; run web type-check, lint and focused tests

Verification: `ngc` type-check and ESLint pass on changed files; web feature/shared Jest suites pass except the pre-existing `calendar.component.spec` and `finance-statement-create.component.spec` failures (also failing on the base branch). Browser verification not run.
