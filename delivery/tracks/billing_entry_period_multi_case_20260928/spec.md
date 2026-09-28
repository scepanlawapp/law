# Billing Entry Period and Multiple Cases Specification

## Problem

Billing entries currently store one work date and at most one case. The dialog also defaults to time-based work and does not consistently expose required-field rules. This cannot accurately represent fixed-fee work spanning a period or work shared across several cases.

## Included

- Replace the single work date with required start and end dates, validating that the end is not before the start.
- Replace the optional single case relationship with an optional many-to-many case relationship.
- Preserve existing billing-entry data through a database migration.
- Filter entries by associated cases and overlapping date ranges.
- Make “Fixed fee” the default unit of measure and rename the selector label to “Unit of measure / Merna jedinica”.
- Require client, descriptions, amount, start date, end date, and unit of measure for every entry.
- Require duration only when the unit of measure is time.
- Use the installed Spartan multiple combobox for selecting cases belonging to the selected client.
- Return work periods and case arrays in shared API contracts and update Financials views accordingly.

## Excluded

- Changes to statement period semantics, price-source rules, tax invoices, or automated amount calculation.
