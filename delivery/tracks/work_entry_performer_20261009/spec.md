# Work entry performer

Capture and editing expose a user selector. New manual work defaults to the current user, task work to its assignee, event work to its first assignee (organizer fallback); editing keeps the saved user. Event Write off creates confirmed non-billable work immediately with user null, without dialogs, when the event has an attributable client. Clientless write-off is described separately in clientless-writeoff-proposal.md and awaits approval; the UI never opens a dialog for it. Preserve access checks and validate assigned users in the workspace.
