# Billing Review Bulk Selection Specification

## Problem

Billing proposals can only be dismissed, restored, or opened for billing one row at a time. Users need to select several visible proposals and apply review actions from the filter area without accidentally triggering row-level actions.

## Included

- Add a checkbox column to pending and dismissed proposal tables.
- Add a select-all checkbox whose scope is the currently loaded proposal page.
- Show the applicable review action and billing action beside the filters when proposals are selected.
- Disable row-level action buttons while any proposal is selected.
- Support arrays of proposal keys for bulk dismiss and bulk restore operations in the API.
- Keep existing single-proposal endpoints compatible.
- Allow the selected billing action to reuse the current dialog for one selected proposal.
- Make the billing action unavailable for multiple selected proposals until the separately planned combined billing dialog supports multiple proposals.
- Clear proposal selection when list or filter context changes.

## Excluded

- Combining multiple proposals into one billing-entry dialog or defining merge semantics for their clients, cases, periods, descriptions, and amounts.
- Pagination changes or cross-page selection.
- Changes to already billed entry selection and statement composition.
