# Financials Backend Specification

Implement an informational service-statement workflow for recorded legal work, reviewable source suggestions, versioned free-form price references, immutable statement snapshots, and manually tracked external invoices/payments.

## Boundaries

- All data is scoped to the existing single PostgreSQL workspace.
- Source records are evidence only; no source completion creates a charge.
- The app does not issue compliant tax/fiscal invoices, calculate tax, determine tariff applicability, collect payments, or call AI providers.
- Every client-facing statement line is backed by a reviewed BillingEntry.
- Sent statements are immutable; corrections use explicit void-and-replace history.

## Decisions

- Candidates are queried live from completed Events, DONE Tasks, SATISFIED Deadlines, CaseActivity, and ClientActivity; BillingSuggestionReview persists dismissal/reopen state.
- Manual statement lines create their BillingEntry atomically.
- OWNER/ADMIN manage office-wide financials; LAWYER may record and view permitted own work; MEMBER has no unrestricted finance access.
- Finance-scoped idempotency keys cover statement creation/send and payment mutations.
