# Payment allocation completion report

The previous implementation omitted automatic/equal allocation, selection controls, a bank statement field, and browser verification. These are implemented and verified. No mandatory acceptance item remains open.

## Behavior and API

`POST /api/financials/payments/allocation-preview` validates a typed request and reads current balances in a repeatable-read transaction. It writes no payment, allocation, or audit records. Automatic mode prioritizes an unambiguous case-insensitive, whitespace-trimmed exact match on invoice number, external invoice number or external reference, then orders by due date, issue date and stable ID. Ambiguous/missing matches produce a warning and fall back to date order. Selected-oldest mode only considers explicitly selected invoices. Equal mode divides integer minor units among selected invoices, caps each at its balance, redistributes surplus, and gives rounding cents deterministically in date/ID order. Surplus above all eligible balances remains unallocated. The existing 100-allocation save limit is enforced for previews too.

The existing save service still revalidates workspace/client/currency/status and current balances under its workspace advisory lock and deterministic invoice row locks. It rejects stale Payment.version, over-allocation, and invoice overpayment. Removed allocations and voided payments are excluded. Persistence and actor/previous/new audit snapshots remain transactional. Preview results require explicit Save.

New regular payment rows start at zero. Existing saved amounts load unchanged. Selection is independent of allocation; unchecking a row never removes money. Manual edits, Puno and clear actions remain available. Replacing an existing proposal requires confirmation; failed previews retain it. New advances must be unallocated, enforced by API and UI, while saved advances can be allocated without changing their purpose.

## Schema and migration

`20261014180000_payment_bank_statement` adds nullable `Payment.bankStatementNumber VARCHAR(50)`. It is optional and nonunique, trims whitespace and preserves leading zeros. A number requires an active same-workspace/currency bank account. Account changes clear the form field. Create, edit, detail and audit snapshots include it. No index was added because no bank-statement query/filter exists. No destructive data operation or financial-history rewrite was needed. The active demo seed explicitly preserves the association.

The migration is applied to the local application database and the isolated test database. Other deployments need `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma` and generated Prisma client/build deployment.

## Visual corrections

Prominent primary gold (under the Gold accent) automatic and secondary equal buttons, icons/subtitles, selected-only date action, independent selection checkboxes, inline localized money fields, Puno/clear actions, overdue labels, gold selection and success allocation states. Totals use success/warning progress indicators; notes and Save/Cancel share the bottom of the card. Optional metadata and bank statement entry remain collapsible. The native fieldset minimum width was corrected so narrow screens stack fields/buttons and scroll only the invoice table. The table is a keyboard-focusable labeled region. Existing semantic themes are preserved; the screenshot uses the app's Charcoal/Gold settings.

## Verification

- API allocation and real PostgreSQL integration suites: **31 passed**. Covers reference matching, deterministic order, equal caps/rounding, maximum decimal amounts, no preview writes, persistence, advances, bank statements, isolation, stale versions, concurrent writers, reversals and idempotency.
- Payment-form unit suite: **9 passed**, including zero initialization, selection independence, preview-only behavior, decline/failure preservation, retry and validation.
- Existing payment Chromium regression suite: **3 passed** (fixture-backed UI regressions).
- Separate **real API + PostgreSQL + Chromium workflow passed**, with no mocked finance endpoints: automatic 400000 → 324960 allocated / 75040 remaining; manual correction; clear; equal 90000 → 30000 each; capped equal 300000 → 96000/96000/108000; selected-only date distribution; deselection; save/reload; invoice balances; bank statement persistence; no eligible invoices; advance creation and later 10000 allocation; keyboard activation; desktop and 390px mobile layout. Screenshots were opened and inspected. An initial screenshot captured progress mid-animation; final captures fast-forward transitions and show correct proportions.
- API and web development builds passed. Targeted TypeScript ESLint passed without warnings. Prisma schema validation and `git diff --check` passed.

Screenshots: [desktop](../../../tmp/payment-verification/desktop.png), [selected allocations](../../../tmp/payment-verification/selected.png), [bank details](../../../tmp/payment-verification/details.png), [mobile fields](../../../tmp/payment-verification/mobile.png), [mobile allocation controls](../../../tmp/payment-verification/mobile-allocation.png). These are local verification artifacts, not production records.

## Repeating the live browser check

Use only a disposable database whose name contains `payment_collection_test`. Start PostgreSQL/Redis using the repository services workflow; migrate that database. Bootstrap `payment-ui@example.test` with the test-only password `PaymentVerify2026` using `apps/api/prisma/seed.cjs` and DATABASE_URL set to that test database. Run the real API with the same DATABASE_URL on port 3002 and the web development server on 4200. From the repository root, set PAYMENTS_TEST_DATABASE_URL and run `node delivery/tracks/payment_form_design_20261014/verification-seed.cjs`, then `node delivery/tracks/payment_form_design_20261014/browser-verification.cjs`. The script overrides only browser runtime API configuration to port 3002; all finance requests and auth use the real API. It writes screenshots to tmp/payment-verification. Seed fresh fixtures before each repeat because the test intentionally persists receipts.

## Changed files

- `.github/bussiness-logic-done-so-far.md`
- `apps/api/prisma/migrations/20261014180000_payment_bank_statement/migration.sql`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed-demo-data-stojkovic.cjs`
- `apps/api/src/app/payment-allocation.spec.ts`
- `apps/api/src/app/payments.integration.spec.ts`
- `apps/web-e2e/src/payments.spec.ts`
- `apps/web/src/app/features/finance-payments/payment-client-picker.component.ts`
- `apps/web/src/app/features/finance-payments/payment-detail.component.html`
- `apps/web/src/app/features/finance-payments/payment-form.component.html`
- `apps/web/src/app/features/finance-payments/payment-form.component.spec.ts`
- `apps/web/src/app/features/finance-payments/payment-form.component.ts`
- `delivery/index.md`
- `delivery/tracks/payment_form_design_20261014/browser-verification.cjs`
- `delivery/tracks/payment_form_design_20261014/index.md`
- `delivery/tracks/payment_form_design_20261014/metadata.json`
- `delivery/tracks/payment_form_design_20261014/plan.md`
- `delivery/tracks/payment_form_design_20261014/report.md`
- `delivery/tracks/payment_form_design_20261014/spec.md`
- `delivery/tracks/payment_form_design_20261014/verification-seed.cjs`
- `libs/api/api-interfaces/src/lib/payments.ts`
- `libs/api/features/financials/src/lib/payment-allocation.ts`
- `libs/api/features/financials/src/lib/payments.controller.ts`
- `libs/api/features/financials/src/lib/payments.dto.ts`
- `libs/api/features/financials/src/lib/payments.service.ts`
- `libs/shared/frontend/api-clients/src/lib/payments.api-client.ts`
