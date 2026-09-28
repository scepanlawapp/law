# Billing Entry Dialog Fix Specification

## Problem

The billing-entry dialog displays untranslated localization keys and can submit values that the Financials API rejects. In particular, a billable entry defaults to no amount, and candidate timestamps are passed unchanged to a date-only input.

## Included

- Add English and Serbian translations for all billing-proposal controls and messages in the dialog.
- Render dialog error keys through localization.
- Normalize candidate timestamps to the date format required by the date input.
- Validate duration, billable amount, and zero-charge reasons before submitting.
- Keep the dialog usable for manual entry when an AI proposal is unavailable.
- Verify the focused frontend behavior and Angular build.

## Excluded

- Changes to billing calculations, formal invoice generation, or Financials backend validation rules.
- Redesign of the broader billing-review page.
