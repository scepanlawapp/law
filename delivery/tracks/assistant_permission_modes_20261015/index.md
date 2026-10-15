# Assistant Permission Modes

Let the user choose how the assistant applies record changes: fill a form for the human to save (Manual), propose a one-click card (Ask), or save directly when nothing is ambiguous (Auto). First action on the framework: a new `create_event` tool.

- **Status:** completed
- **Scope:** permission mode in user settings and per chat session, `PendingAction.mode`, the `create_event` assistant tool, form completion endpoint, event dialog prefill, card variants.
- **Specification:** [spec.md](spec.md)
- **Plan:** [plan.md](plan.md)
- **Metadata:** [metadata.json](metadata.json)
