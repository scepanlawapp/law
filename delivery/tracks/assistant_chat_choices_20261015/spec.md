# Spec: Assistant chat choices and accent-insensitive names

## Why
- When a name, case, or event matches several records, the assistant lists them in prose and the user must type the answer.
- Database name lookups ignore case but not diacritics, so "Ilic" does not find "Ilić" (colleague lookups already fold accents in code; clients, contacts, cases, and events do not).

## What

### Accent-insensitive names
- Name matching folds case and diacritics on both sides: Serbian (č, ć, š, ž) and common Latin accents; đ matches both "dj" and "d" ("Djordje" and "Dordje" find "Đorđe").
- Applies to the clients and cases list search (screens and assistant tools) and to the assistant's resolution of participants, clients, cases, and events.
- No database extension; table and column names come from a fixed allowlist, user text is always a bound parameter.

### Clickable choices
- Tool results that return candidates carry `choices` (label shown on the button, reply sent when clicked).
- The turn's last tool result decides: choices are stored on the assistant message only when its last tool call returned them and nothing waits on a card or form; at most five.
- Buttons show under the latest assistant message while no newer user message exists; a click sends the reply as the user's message. Typing still works.

## Out of scope
Accent-insensitive search on other screens (documents, users), choices for questions the model asks without a tool.
