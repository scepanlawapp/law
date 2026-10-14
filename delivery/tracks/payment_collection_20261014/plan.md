# Implementation plan

- [x] Inspect invoice, permissions, schema and UI conventions; create branch and register track.
- [x] Create index.md, spec.md, plan.md and metadata.json.
- [x] Add payment/allocation/audit schema, migration and seed compatibility.
- [x] Implement shared contracts, validated APIs, precise balances, audit, idempotency and concurrency protection.
- [x] Implement payment list, filters, summaries, forms, detail/history and void confirmation.
- [x] Integrate invoice collection and client receivables.
- [x] Run focused backend/frontend checks and fix findings.
- [x] Update implemented-behavior documentation and completion metadata.

## Verification

- Prisma schema validation and client generation passed.
- All 50 migrations applied successfully to the isolated `law_payment_collection_test` PostgreSQL database.
- API TypeScript check and targeted payment lint passed without errors or warnings.
- PostgreSQL payment integration and existing invoice suites: 61 tests passed.
- Payment form and existing invoice UI suites: 14 tests passed.
- Chromium browser tests: 3 passed, covering server filters, searchable selection, multi-invoice allocation, failed-save retry/idempotency, void confirmation and keyboard opening of selects. API fixtures are restricted to tests.
- Angular development build passed, including 30 library dependencies.
- Desktop/mobile screenshots inspected with charcoal/gold and ivory/royal-blue themes. No hardcoded feature colors were introduced.
- `git diff --check` passed.

## Delivery and operation

Core additions: `payments.ts` shared contracts; `payments.dto.ts`, `payments.controller.ts`, `payments.service.ts`; `payments.api-client.ts`; `finance-payments/` components and tests; `20261014120000_payment_collection/migration.sql`. Existing invoice service/list/detail, client Financials tab, sidebar/routes, schema, localization catalogs, implemented-behavior notes and active additive seed were updated.

The application database was not migrated during verification. Before running this feature against it, apply the checked-in migration with `npm run db:migrate` and restart the API. Bank statement importing remains intentionally unavailable. No production receipts or accounting entries were created. Payment restoration, FX conversion and accounting reports remain outside scope.

The originally documented `seed-demo-data.cjs` does not exist in this checkout. The active `seed-demo-data-stojkovic.cjs` documents preservation of independent payment records; no guessed receipts were seeded.
