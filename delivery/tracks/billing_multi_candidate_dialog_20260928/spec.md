# Billing Multi-Candidate Dialog Specification

## Problem

The billing-entry dialog is structured for one proposal and mixes shared invoice details with one item-level amount. The work-review page can now select several proposals, but cannot edit or record them together.

## Included

- Pass every selected billing proposal into the modal.
- Place client and cases in the first row, and work start/end dates in the second row.
- Show one full-width client description followed by one full-width internal description.
- Replace the single unit/duration/amount controls with a table containing one editable row per selected proposal.
- Give each row unit of measure, conditional minutes, amount, and a remove action.
- Remove the billing-decision selector and create billable entries by default.
- Keep manual creation available with one initial item row.
- Persist one billing entry per remaining item and mark all corresponding proposals recorded in one backend transaction.
- Preserve the proposed performer and source reference for each candidate-created entry.

## Excluded

- AI billing suggestions, price-source recommendations, expense cost, quantity, custom currency, and mixed-client billing in one modal.
- Editing existing billing entries.
- Invoice or statement generation.
