# Chat Session Soft-Delete

- **Track ID:** `chat_session_soft_delete_20260909`
- **Type:** Feature
- **Status:** In progress

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

In progress on branch `feature/session-status`. Adding an `isDeleted` boolean to `ChatSession` so that deleting a conversation or clearing chat history marks the session as deleted while preserving all underlying data. The bulk clear endpoint (`DELETE /users/me/conversations`) switches from a hard `deleteMany` to a soft `updateMany`, a new per-session `DELETE /chat/sessions/:sessionId` endpoint is added, deleted sessions disappear from the list and behave as not-found everywhere else, and the assistant sidebar gains a per-conversation delete action.