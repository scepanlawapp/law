# Spec

## Problem

Chat sessions can belong to a case (`ChatSession.caseId`). The case detail page lists them on the overview card and the Asistent tab, but every row linked to `/assistant?caseId=<case>`. No session id was passed, so the assistant opened the most recent conversation instead of the one clicked.

The drafts list on the Asistent tab showed raw draft UUIDs and was not clickable.

## Outcome

- Clicking a chat opens `/assistant?sessionId=<id>` and that conversation is selected, even if it is not on the first page of the sidebar.
- Each chat row shows its last-updated date and how many drafts it holds.
- Each draft row shows the translated document type, approval status, and creation date. Clicking it opens the owning chat, whose rail shows the latest draft.
- Opening an existing chat does not carry `caseId`. Only "Start assistant" pre-links a new chat to the case.

## Out of scope

- Filtering the assistant sidebar to one case.
- Opening a specific older draft in the assistant rail.
