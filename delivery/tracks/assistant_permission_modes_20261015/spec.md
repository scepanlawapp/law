# Spec: Assistant Permission Modes

## Why
Every assistant record change is a one-click approval card today. Lawyers want a choice similar to coding agents: review a prefilled form, approve a card, or let the assistant save on its own for routine, unambiguous requests ("Zakaži mi sastanak sa Borkom 16.10. u podne").

## What
- **Modes** (`AssistantPermissionMode`):
  - `MANUAL` — the assistant prefills the record form (event dialog); the human edits and saves.
  - `ASK` (default) — the existing approval card.
  - `AUTO` — the assistant saves immediately when the proposal is unambiguous and has no warnings.
- **Where:** a default in user settings (Profile → Asistent) and a per-conversation override in the chat composer (`ChatSession.permissionMode`, `null` = user default).
- **Always ask when unsure:** a name that matches zero or several records never creates a proposal; the assistant asks the user to choose. Warnings (calendar conflicts) downgrade `AUTO` to `ASK`.
- **Mode is decided by the server**, never by the model. Legacy actions (`link_case`, `create_deadline`, `create_tasks_from_brief`, `update_client_from_document`) stay on `ASK`.
- **`create_event` tool:** title, type, local date/time (Europe/Belgrade), duration, participants (colleagues, clients, contact persons by name), optional case, location, description. Organizer is the conversation owner. Overlapping scheduled events of the organizer and assignees are listed as warnings.
- AUTO saves run as the conversation owner (organizer and activity-log actor), are recorded as a `PendingAction` with `mode = AUTO`, and do not pause the turn.
- MANUAL saves go through `POST /chat/pending-actions/:id/complete` with the edited event; the agent resumes and is told whether the user edited it.

## Out of scope
Migrating legacy actions to MANUAL/AUTO, undo for AUTO saves, clickable candidate picker, per-action-type modes.
