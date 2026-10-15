# Assistant Time Capture, Billing Answers, and Undo

Let the assistant rebuild a day's work into proposed time entries, answer read-only billing questions (receivables, unbilled work, retainer usage) within the user's finance permissions, and undo its automatic saves.

- **Status:** completed
- **Parent:** [assistant_actions_modes_20261015](../assistant_actions_modes_20261015/index.md)
- **Scope:** `get_day_work`, `log_work_entries`, `get_client_billing`, `list_receivables` tools; reads run as the conversation owner; `PendingAction.undoneAt` and the undo endpoint; card undo state.
- **Specification:** [spec.md](spec.md)
- **Plan:** [plan.md](plan.md)
- **Metadata:** [metadata.json](metadata.json)
