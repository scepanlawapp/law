# Billing Statement Edit, Delete, and Detail Routing Specification

## Problem

Billing statements can currently be created and listed, but an existing statement cannot be opened in the composer for correction, removed from the list, or navigated to a dedicated detail route.

## Included

- Reuse the statement composer for create and edit modes.
- Read the statement identifier from the edit route, load its data, and prefill the typed reactive form.
- Persist supported changes to an existing draft statement and its line selection.
- Add an actions column with edit and delete controls to the statement list.
- Require confirmation before deleting a statement and refresh the list after success.
- Make statement rows keyboard- and pointer-navigable to a dedicated statement detail route.
- Add a deliberately minimal placeholder page for `finance/statements/:id` so detail behavior can be implemented later.
- Preserve existing statement domain names, shared contracts, authorization guards, workspace scoping, localization, semantic theme tokens, and Spartan/UI patterns.

## Excluded

- A finished statement detail experience.
- Editing or deleting non-draft statements.
- Changes to sending, voiding, numbering, payments, or document export.
- Renaming statement domain identifiers to invoice identifiers.
