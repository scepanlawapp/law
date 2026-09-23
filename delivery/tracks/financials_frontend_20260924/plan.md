# Implementation Plan

- [x] Inspect current Angular routes, sidebar, localization, API clients, and Spartan/UI patterns.
- [x] Type the shared Financials API responses and client methods.
- [x] Add Serbian and English Financials translations.
- [x] Implement overview aggregates and needs-attention list.
- [x] Implement work-review candidates, dismissal/reopen, recorded-work table, selection, and entry form.
- [x] Implement statement list, client-scoped draft composer, derived display totals, send/void actions, and routed preview.
- [x] Implement client balances list and client-account drill-down.
- [x] Implement client/public price-source tabs and raw free-form version creation.
- [x] Add external invoice/payment forms and backend-derived statement balances.
- [x] Run Angular strict-template compilation and Financials-specific lint/tests.
- [ ] Add focused Financials frontend tests for validation, selection, preview privacy, and conflict handling.
- [ ] Complete backend follow-up endpoints for payment reversal, manual composer lines, and full server-side pagination/account summaries.

## Implemented corrections

- Added `BillingEntryDialog` and candidate recording resolution so Review -> Record actual work persists source identity and marks the candidate recorded.
- Added Decimal-safe statement totals, payment status, overview sent totals, externally verified unpaid totals, client-account aggregates, and complete price-source version history endpoints.
- Replaced browser confirmations, fixed statement void invocation, made statement/client query parameters reactive, reused logical statement idempotency keys, and switched work-date defaults to local date-only values.
