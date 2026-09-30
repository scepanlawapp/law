# Billing Statement Invoice Fields Specification

## Problem

Billing statements currently store a service-period header and one amount per line. The statement editor cannot capture the invoice dates, issue/payment metadata, tax breakdown, cash-bill reference, country, or the corresponding net/VAT/gross values required for a complete invoice.

## Included

- Rename statement `periodStart` and `periodEnd` to date-only `dateOfCreate` and `dateOfMaturity` fields.
- Add date-only `dateOfTurnover` to statements.
- Add statement strings for `placeOfIssue`, `methodOfPayment`, `comment`, `numberOfCashBill`, and `country`.
- Add statement decimal values for `netAmount`, `vatRate`, `vatAmount`, and `grossAmount`.
- Rename statement-line `amount` to decimal `netAmount` and add decimal `vatRate`, `vatAmount`, and `grossAmount`.
- Migrate existing data without losing the old statement dates or line amount values.
- Expose all fields through shared API contracts, validation DTOs, finance service responses, and create/update persistence.
- Add all new and renamed fields to the Angular create/edit statement flow using typed reactive forms and the existing Helm primitives.
- Update statement list/detail presentation to use invoice dates and gross totals after removal of the old fields.
- Update demo seed data, focused tests, translations, and implemented-business documentation.

## Behavior and validation

- Invoice dates are required date-only values.
- Invoice metadata strings are required by the create contract but may contain an empty value where the business has no applicable reference or comment.
- Amounts and VAT rates accept at most two decimal places and cannot be negative; line net amounts and gross amounts must be greater than zero.
- Statement currency continues to be shared by all lines.
- `total` remains in responses as a display compatibility value and equals the statement `grossAmount`.
- Existing rows use the old period start as creation/turnover date and old period end as maturity date; existing line amount becomes both line net and gross amount with zero VAT, and statement monetary values are backfilled from its lines.

## Excluded

- Automatic tax calculation or enforcement that header totals equal the sum of line totals.
- Payment processing, fiscalization, accounting export, or cash-register integration.
- Changes to statement status transitions, source eligibility, or permissions.
