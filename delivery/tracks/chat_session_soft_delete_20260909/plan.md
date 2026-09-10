# Chat Session Soft-Delete Plan

- [x] Add `isDeleted Boolean @default(false)` to the `ChatSession` model in `apps/api/prisma/schema.prisma`, plus an index; create migration `20260909120000_chat_session_soft_delete`.

- [x] Add `isDeleted: boolean` to `ChatSessionSummary` and add `"session.deleted"` to the `ChatEventType` union in `libs/api/api-interfaces/src/lib/api-interfaces.ts`.

- [x] `chat.service.ts`: filter `isDeleted: false` in `listSessions`, block deleted sessions in `requireSession`, map `isDeleted` in `toSessionSummary`, and add `deleteSession(workspaceId, sessionId)` which soft-deletes via `requireSession` + `update`, emits `session.deleted`, returns `ChatSessionSummary`.

- [x] `chat.controller.ts`: add `@Delete("sessions/:sessionId")` delegating to `chat.deleteSession`.

- [x] `user-settings.controller.ts`: change `clearConversationHistory` from `deleteMany` to `updateMany({ data: { isDeleted: true } })`, keep `{ deleted: count }`.

- [x] Tests: `chat.service.spec.ts` (mock sessions gain `isDeleted: false`; new cases: list filters deleted, deleteSession sets flag + emits, deleted session 404 on get/update) and new `user-settings.controller.spec.ts` (clear history soft-deletes, response shape preserved).

- [x] `api-clients.ts`: add `ChatApiClient.deleteSession(sessionId)` calling `DELETE /chat/sessions/:sessionId`.

- [x] `assistant.component.ts`/`.html`: add `deleteSession(sessionId)` with a danger `ConfirmDialogService`, remove the session from the list, and if it was selected reset the chat panel/stream; add the delete button to `.conversation-item`.

- [x] i18n: add `assistant.deleteConversation`, `assistant.deleteConversationConfirm`, `assistant.deleteConversationAction`, `assistant.conversationDeleted`, `assistant.conversationDeleteError` to `apps/web/public/i18n/ser.json` and `eng.json`.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.

Verification status: focused API tests and project validation completed for this track.