# Chat Starter Pickers — Specification

## Why

Some starter cards ([chat_starter_prompts_20260928](../chat_starter_prompts_20260928/spec.md)) still make the user type a client, case, or colleague name by hand. Typos then produce AMBIGUOUS or NOT_FOUND answers. Picking from a list is faster and resolves exactly.

## What

- A card may declare `pick`: `client`, `case`, `person`, or `document`. Clicking it opens a searchable picker dialog.
- **After a pick:**
  - The card's prompt is built with an exact reference: client `„Name“ (clientNumber)`, case `caseNumber („Name“)`, colleague full name, document `„Title“ (doc:<id>)`.
  - `send` cards send at once. `compose` cards fill the composer with the reference.
  - Cancelling does nothing.
- **A picked case is only named in the text.** The session is not linked to it.
- **General set (no linked case)**, grouped under four headings: my work, cases & clients, legal, drafting & documents.
  - New picker cards: case overview, case work, case activity, client overview, colleague's agenda, set a deadline, draft a tužba, analyze a document.
  - The document picker also offers "attach a new file". It falls back to filling the composer.
- **The case-linked set is unchanged.**
- **Backend.** `read_document` and `search_documents` also accept an explicit `doc:<id>` for a non-archived document in the workspace, even when it is outside the conversation's case. `list_documents` is unchanged.

## Non-goals

- @-mentions in the composer.
- Linking the session to a picked case.
- Picking tariff items.
