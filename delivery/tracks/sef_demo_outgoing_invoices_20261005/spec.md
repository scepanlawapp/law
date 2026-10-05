# SEF DEMO Outgoing Invoices Specification

## Goal

Add a complete first-version workflow from an existing ordinary outgoing invoice to immutable UBL XML, local validation, DEMO SEF upload, persisted identifiers and status, and manual remote-status refresh.

## Scope

- Reuse the existing `Invoice`, `InvoiceLine`, organization settings, bank accounts, authorization, workspace context, API clients, and invoice detail screen.
- Add additive Prisma storage for immutable submission attempts, separate local submission state, all distinct remote identifiers, validation evidence, source snapshots, and duplicate protection.
- Support only domestic RSD ordinary invoices whose issuer, recipient, payment account, dates, amounts, VAT categories, and exemption basis can be mapped without inference.
- Reject PRODUCTION and unsupported document/currency/tax/public-sector scenarios with structured errors.
- Generate UBL from server-loaded persisted data, perform offline schema/profile validation, upload only from the explicit send route, and refresh status manually.
- Keep DEMO submission separate from the local send/billing workflow and prevent mutation while a submission is active, uncertain, or confirmed remotely.
- Add Serbian and English invoice-detail controls, shared contracts, focused tests, developer documentation, and business-logic documentation.
- Prefill new invoice headers and lines from organization invoice, payment, currency, tax, and company defaults. When editing a draft, fill only values that are still missing and never replace persisted invoice data.
- Keep SEF tax-category and exemption assignment out of the invoice composer; the frontend sends ordinary monetary line data and backend policy owns those SEF fields.

## Reliability and security decisions

- A persisted idempotency key is bound to workspace, invoice, environment, and payload. Reuse returns the same attempt; conflicts never cause a second upload.
- The upload transaction ends before network I/O. `PREPARED` is atomically claimed as `SENDING`; ambiguous transport outcomes become `UNKNOWN` and are never retried automatically.
- Confirmed remote creation yields `SUBMITTED` even if a subsequent status read fails. Remote status is never invented from HTTP success.
- Submitted XML bytes remain immutable and are returned for later downloads even when organization or client data changes.
- API keys are decrypted only in the backend, never returned or logged, and issuer tax identity is bound to the submission record.
- External XML entities and network schema resolution are disabled; bundled validator assets must be available in built output.

## Source verification

Record the official SEF API/profile documentation and versions actually used in the developer guide. Treat behavior not established by the official material or executable tests as unverified and block the affected action.
