# Billing Statement UI Specification

## Problem

The deterministic financials backend supports standalone `BillingStatementLine` records and draft `BillingStatement` creation, but the Angular application does not expose a statement list or a draft composer.

## Included

- Add finance routes for a paginated/filterable statement list and a dedicated create page.
- Add localized semantic breadcrumbs and navigation to statements.
- Build a typed reactive statement form using existing `BillingStatement` fields and a `FormArray` of statement-line controls.
- Import paginated `UNBILLED` lines for the selected client through the existing dynamic-dialog pattern.
- Prevent duplicate imports and detach imported line IDs when the selected client changes without clearing row values.
- Add and remove manual rows using existing statement-line field names.
- Block save for invalid data, missing lines, and currency mismatch.
- Persist manual rows with the existing line endpoint, update edited imported rows, and create the draft through the existing statement endpoint.
- Add shared frontend request contracts and API-client methods only where the existing backend endpoints already exist.
- Update implemented-business documentation and localized copy.

## Excluded

- Tax or fiscal invoice issuance, PDFs, email delivery, payments, discounts, tax, FX conversion, approval workflows, and statement detail/edit screens.
- Backend statement filtering or pagination changes.
- New finance domain models or renamed existing fields.
