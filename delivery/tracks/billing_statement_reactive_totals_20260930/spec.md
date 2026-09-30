# Billing Statement Reactive Totals Specification

## Context

The invoice form exposes net, VAT, and gross values at both statement and row level, but the statement amounts should be derived from its rows. Users also need predictable two-way row calculations while editing any monetary field.

## Requirements

- Invoice rows are the source of truth for statement net, VAT-amount, and gross totals. Those totals are derived immediately and are not manually editable.
- The statement VAT rate remains independently user-editable.
- Changing a row net amount or VAT rate recalculates its VAT amount and gross amount.
- Changing a row VAT amount recalculates its VAT rate and gross amount; zero net is handled without a non-finite rate.
- Changing a row gross amount recalculates its net and VAT amounts using the current VAT rate.
- Monetary results and derived VAT rates are normalized to two decimals. Invalid, non-finite, and negative values do not propagate, and programmatic updates do not create calculation loops.
- The compact, right-aligned invoice summary appears below the item table, followed by the full-width comment field.
- The read-only statement detail view mirrors that hierarchy: invoice metadata, item table, compact summary, comment, and navigation actions. It does not repeat totals in the metadata grid or retain the old gross-only table footer.
- The create/edit invoice-lines title and actions form a compact toolbar directly attached to the table, with matching horizontal alignment, consistent control heights, a primary manual-add action, and unobtrusive client-selection guidance beside the disabled import action.
- Existing create/edit payload contracts and visual language remain intact.

## Excluded

- Backend schema or API contract changes.
- Payment processing, fiscalization, accounting export, or cash-register integration.
- Changes to statement status transitions, source eligibility, or permissions.
