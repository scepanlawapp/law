# Billing Statement Line Workflow Specification

## Problem

The current financial flow creates `BillingEntry` records and later copies them into statement lines. The desired workflow treats each reviewed work proposal as a standalone statement line immediately, then groups eligible lines into a statement/invoice later.

## Included

- Remove `BillingEntry` and `BillingEntryCase` from the active data model.
- Allow a `BillingStatementLine` to exist before it belongs to a statement.
- Give standalone lines a client, description, amount, currency, lifecycle status, cancellation metadata, source reference, and audit metadata.
- Create one statement line for every retained modal row.
- Keep one shared client across all rows; make description, amount, and currency row-specific.
- Remove type, duration, dates, and cases from the creation modal.
- Show aggregate totals grouped by currency below the item table.
- Link event, task, and deadline sources directly to the line that billed them.
- Keep candidate review state linked to the resulting statement line.
- Attach eligible standalone lines to a statement later and transition their lifecycle as statements are sent, edited, or voided.
- Update demo seed data, shared contracts, API clients, tests, and implemented-business documentation.

## Excluded

- A new invoice creation screen.
- Cancellation UI for statement lines.
- Tax calculation, discounts, exchange-rate conversion, and payment allocation changes.
- Backfilling historical production data beyond the schema migration included for this development workflow.
