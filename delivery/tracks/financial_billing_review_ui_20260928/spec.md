# Financial Billing Review UI Specification

## Problem

The first Financials sidebar workflow is named “Work review” and splits candidates and recorded entries across tabs. The recorded-work tab also contains a second manual-entry section. Filtering is limited to one client and one source and differs between the two lists.

## Included

- Rename the Financials sidebar item to “Bill” in English and “Fakturiši” in Serbian.
- Use “Pregled rada za fakturisanje” as the Serbian page title, with an equivalent English billing-review title.
- Replace the tabs with one labeled single-select control for “Candidates / Za fakturisanje”, “Billed entries / Fakturisano”, and dismissed proposals.
- Keep all choices as list views of their existing candidate or billing-entry data.
- Show dismissed proposals with “Return to unbilled” and “Make a bill” actions.
- Add shared client, case, and source multiselect filters.
- Apply all filters on the backend before pagination for both candidate and entry lists.
- Remove the manual work/expense form that currently follows the recorded-entry list.
- Preserve candidate review actions and recorded-entry selection behavior.

## Excluded

- Formal invoice creation, statement composition, pricing changes, new pagination controls, or route renaming.
