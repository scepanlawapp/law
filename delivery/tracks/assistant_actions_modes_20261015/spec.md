# Spec: Assistant actions on permission modes

## Why
The permission modes shipped with a single mode-aware action (`create_event`). Everything else is always an Approve card. The highest-value next actions are time capture (roadmap priority), tasks, and changes to existing meetings. Deadlines need the prefilled form but must never be saved automatically.

## What
A per-action policy decides which modes an action supports. A mode the action does not support falls back to the Approve card. A proposal with warnings (calendar conflicts) is never automatic.

| Action | Manual (form) | Auto | Notes |
|---|---|---|---|
| `create_event` | event dialog | yes | unchanged |
| `reschedule_event` | event dialog (edit) | yes, if no conflict | |
| `cancel_event` | – | – | always a card; cancelling cannot be undone |
| `create_task` | task dialog | yes | |
| `log_work_entry` | quick-capture dialog | yes, saved as PROPOSED | lawyer confirms it in the time review |
| `create_deadline` | deadline dialog | – | Auto falls back to the card |
| `link_case` | – | yes | a link can be changed again; no dialog, so Manual is a card |
| `create_tasks_from_brief` | – | yes | no multi-task dialog, so Manual is a card |
| `update_client_from_document` | – | yes, if no conflict | fills only empty fields; a document/record conflict is a warning |

Deadlines detected from documents keep using cards in every mode (they come in batches).

### Ambiguity always asks
- Names (clients, colleagues, contact persons) that match zero or several records return the candidates and the model asks the user.
- Event lookup for reschedule/cancel searches the owner's upcoming scheduled events; zero or several matches return candidates (title, participants, date and time).
- Work entries need a client: from the case, the named client, or the conversation's linked case; otherwise the model asks.
- Dates in the past (tasks, events) and in the future (work entries) are rejected.

### Form completion
One endpoint, `POST chat/pending-actions/:id/complete`, validates the human-edited body against the domain DTO for the action type and executes it like an approval.

## Out of scope
Undo for automatic saves, a clickable candidate picker, completing tasks, creating clients/cases, financial actions.
