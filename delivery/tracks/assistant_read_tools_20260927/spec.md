# Assistant Read Tools — Specification

## Why

The agent can read legal sources, one case (`get_case`), and this conversation's drafts. It cannot answer everyday office questions: "koje rokove imam ove nedelje?", "šta je otvoreno na predmetu P-12/2026?", "pronađi klijenta Petrović", "šta Marko ima sutra?", "šta se dešavalo na predmetu?". All of that data is already served by existing Nest services.

## What

Six new tools, all with side-effect level `none`. They are backed by existing services and scoped to the workspace.

| Tool | Answers |
|---|---|
| `search_clients(query?, status?, responsible?)` | Find clients by name, PIB, or number |
| `get_client(reference)` | One client: type, status, responsible lawyer, contacts, open cases |
| `search_cases(query?, status?, priority?, client?, responsible?)` | Filtered case list |
| `list_work_items(kind, case?, client?, person?, state, from?, to?, overdueOnly?)` | Tasks, deadlines, events |
| `get_agenda(from, to, person?)` | Merged calendar of events, tasks, and deadlines (at most 31 days) |
| `list_activity(case?, client?, includeNotes, limit)` | Activity log and notes, newest first |

`get_case` also returns the case's responsible lawyers and the number of open tasks and deadlines.

## Who is "me"

- The turn carries the sender, taken from `ChatSession.createdByUserId`.
- `person`/`responsible` accepts `"me"` (the sender), a colleague's name (matched against active workspace members, case- and diacritic-insensitive), or `"office"` (no user filter).
- An ambiguous name returns the candidates.
- The prompt names the current user.

## Limits and privacy

- Lists are capped (10 entities, 20 work items, 50 agenda entries) and report `truncated`.
- Note and activity text is clipped to 500 characters and treated as data.
- Text is in Latin script. Dates are YYYY-MM-DD in Europe/Belgrade.
- No JMBG, ID-document numbers, or addresses are returned.
- Unknown references return a message. Ambiguous references return candidates.
- The tools never write. Record changes still go through the confirmation tools.

## Out of scope

- Documents and finance (groundwork only).
- Write tools beyond the existing confirmations.
