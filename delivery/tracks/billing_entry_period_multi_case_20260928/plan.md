# Billing Entry Period and Multiple Cases Plan

- [x] Inspect the current billing schema, DTOs, service behavior, contracts, dialog, and installed Spartan multiselect APIs.
- [x] Create and register the delivery track before changing application code.
- [x] Add the date-range and billing-entry/case join schema with a data-preserving migration.
- [x] Update Financials DTOs, service queries, summaries, statement composition, and tests.
- [x] Update shared contracts and Financials screens for periods and multiple cases.
- [x] Update the dialog defaults, required validators, conditional duration rule, date range, and case multiselect.
- [x] Add English and Serbian translations and focused regression coverage.
- [x] Run Prisma validation/generation, targeted tests, lint/format checks, and frontend/backend builds.
- [x] Update demo seeding/business documentation and complete the delivery track.

## Verification

- Prisma schema validation and client generation passed; the data-preserving migration applied successfully to the local development database.
- Financials service Jest spec passed: 1 suite, 8 tests.
- Billing-entry utility Jest spec passed: 1 suite, 7 tests.
- API and Angular development builds passed.
- API lint passed with existing warnings; targeted changed-file ESLint passed with existing Financials service warnings only.
- Full web lint remains blocked by nine unrelated pre-existing errors in assistant, documents, and sidebar files; no changed billing file was reported.
- The running Serbian UI showed “Merna jedinica” defaulted to “Fiksna naknada”, start/end dates, and a multiple-case selector.
