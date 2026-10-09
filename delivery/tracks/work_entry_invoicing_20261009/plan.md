# Plan

- [x] Create delivery track and implementation branch.
- [x] Add WorkEntry value/currency schema migration, DTOs, API mapping, defaults, and create/edit coverage.
- [x] Add WorkEntry value/currency controls and localization.
- [x] Extend import dialog with typed SEPARATE/GROUPED result and preserve selection/exclusion behavior.
- [x] Add deterministic grouped line construction and pricing behavior to existing invoice form helpers.
- [x] Add expandable linked WorkEntry details and invoice-wide linked-work overview.
- [x] Add safe unlink and confirmed linked-line deletion; preserve draft save/cancel semantics.
- [x] Preserve atomic backend association claims, eligibility rules, and conflict handling.
- [x] Verify draft reload, invoice totals/VAT, PDF, work specification, and deep-link regressions.
- [x] Update business behavior documentation and complete focused tests.
- [x] Run final lint/build and migration/PDF regression checks.

Validation:

- `npx prisma validate --schema apps/api/prisma/schema.prisma` passed.
- Local additive migration `20261009150000_work_entry_value_currency` applied; Prisma reports database up to date.
- API build passed.
- Focused API suites: 4 passed, 163 tests passed.
- Focused web suites: 4 passed, 96 tests passed.
- Final focused web suites: 5 passed, 101 tests passed, including invoice print/work specification.
- Final API build and Angular development build passed.
- API lint passed with existing warnings; changed TypeScript ESLint passed with existing FinancialsService warnings.
- Workspace `web:lint` remains blocked by unrelated existing errors in `assistant/matter-link.component.ts` and `layout/sidebar/sidebar.component.html`.
- Seed syntax check passed.
- Follow-up: `UNDECIDED` added as an invoice-import candidate in picker, deep-link, and backend claims; focused API financial tests passed (26), picker/composer tests passed (15).
- [x] Follow-up: widen the import picker and show each candidate's recorded value and currency with localized missing-value labels.
