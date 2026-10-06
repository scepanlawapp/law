# Documents Row Associations Specification

## Scope

Allow users to manage linked clients and cases directly from the Documents list's Linked to column.

## What

- Add an accessible action to each document row that opens a Spartan dynamic dialog.
- Show an icon-and-text connect action for unlinked documents and a compact icon action for documents with existing links.
- Provide searchable multi-selects for clients and cases, with zero or more selections in standalone mode.
- Persist both relationship ID arrays through `DocumentsApiClient.update`.
- Keep the dialog open on failure; close only after a successful update.
- Refresh the list and emit `documentsChanged` after a successful save.
- Preserve fixed case/client context in embedded detail tabs.
- Add English and Serbian Latin labels and focused tests.

## Non-goals

- Changing document detail editing, upload behavior, list filters, or API contracts.
- Changing the case/client detail tab's fixed filtering behavior.
