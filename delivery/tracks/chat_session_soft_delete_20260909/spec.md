# Chat Session Soft-Delete Specification

## Goals

- Add an `isDeleted` attribute to `ChatSession` that marks a session as deleted without losing any underlying data.
- When a user deletes a single session or clears the full chat history, preserve all rows (messages, attachments, workflow jobs, extraction/draft results) and only flip `isDeleted` to `true`.
- Add a per-session delete endpoint `DELETE /chat/sessions/:sessionId` (currently only the bulk clear endpoint exists).
- Keep the existing bulk endpoint `DELETE /users/me/conversations` but change its implementation from a hard `deleteMany` to a soft `updateMany({ isDeleted: true })`, preserving the `{ deleted: count }` response shape.
- Deleted sessions are excluded from the session list and treated as not-found by every read/mutation path (`getSession`, `updateSession`, `sendMessage`, events).
- Add a delete affordance in the assistant sidebar so users can delete a single conversation in the UI.

## Non-goals

- A recycle bin / restore endpoint — once soft-deleted, a session is permanently hidden (the flag is never cleared by the app).
- A `deletedAt` timestamp — only the `isDeleted` boolean is added per requirement.
- Any change to the `ARCHIVED` status mechanism — it keeps its current, separate semantics.
- Purging soft-deleted rows from the database (future cleanup job if needed).

## Context model

- `ChatSession.isDeleted Boolean @default(false)` in the Prisma schema, mirrored on the API contract (`ChatSessionSummary.isDeleted: boolean`).
- `listSessions` filters `isDeleted: false` before pagination/search/date filtering.
- `requireSession` (the single ownership guard used by get/update/message paths) also filters `isDeleted: false`, so deleted sessions are indistinguishable from non-existent ones for API consumers.
- `clearConversationHistory` performs `prisma.chatSession.updateMany({ where: { createdByUserId }, data: { isDeleted: true } })` and returns `{ deleted: result.count }`.
- `deleteSession` performs a `requireSession` check, then `prisma.chatSession.update({ data: { isDeleted: true } })`, emits a `session.deleted` SSE event, and returns the updated `ChatSessionSummary`.

## Users

- **Primary:** End users who want to tidy their workspace by deleting individual conversations without permanently erasing the underlying analysis artifacts.
- **Secondary:** Users who clear all conversation history from data settings — the operation becomes reversible-at-the-data-layer but remains invisible in the product.