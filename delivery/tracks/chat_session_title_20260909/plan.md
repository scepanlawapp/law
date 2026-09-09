# Chat Session Auto-Title Plan

- [ ] Create `libs/api/ai/workflows/title-generation/` — new Nx library with `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `package.json` (`@law/title-generation`), `jest.config.cts`, `eslint.config.mjs`, `README.md`. Schema: `titleSchema` (`{ title: z.string().min(1).max(100) }`), system prompt, `generateTitle(content: string, provider: ChatModelProvider)` function. Tests with `FakeChatModelProvider`.

- [ ] Register `@law/title-generation` in `libs/api/features/chat/package.json` dependencies and add `import { generateTitle } from "@law/title-generation"` to `chat.service.ts`.

- [ ] Add `TITLE_CONTENT_MAX_CHARS` (default 300) to `ChatRuntimeConfig` / `chat.config.ts` for the per-attachment text preview budget used as title generation input.

- [ ] Add private `runTitleGeneration(sessionId: string, content: string, attachments: ChatAttachmentSummary[])` method in `chat.service.ts` — calls `generateTitle()` via `resolveProvider()`, on success runs `prisma.chatSession.update({ where: { id: sessionId }, data: { title } })`, emits `session.title.updated` event. On LLM failure, falls back to truncated user message (`content.slice(0, 80)`).

- [ ] Add `"session.title.updated"` to the `ChatEventType` union in `libs/api/api-interfaces/src/lib/api-interfaces.ts` and add optional `title?: string` field to `ChatStreamEvent`.

- [ ] Wire `runTitleGeneration()` into `sendMessage()` — after the `updatedAt` bump (line ~207) and before the `void this.runTriage(...)` call, check `session.title === "New chat"`, then fire-and-forget `void this.runTitleGeneration(session.id, content, attachments).catch(...)`.

- [ ] Add `PATCH /chat/sessions/:id` route to `chat.controller.ts` with `UpdateChatSessionDto` (`title?: string`, `@MaxLength(200)`).

- [ ] Add `updateSession(workspaceId, sessionId, userId, title?)` to `chat.service.ts` — validates ownership via `requireSession`, updates title, returns `ChatSessionSummary`.

- [ ] Add `updateSession()` to `ChatApiClient` in `libs/shared/frontend/api-clients/src/lib/api-clients.ts` — `PATCH /chat/sessions/:id` with `{ title }` body.

- [ ] Handle `session.title.updated` SSE event in `assistant.component.ts` `handleEvent()` — upsert the session's title in the `sessions` signal array.

- [ ] Unit tests: `generateTitle()` with `FakeChatModelProvider`; `runTitleGeneration()` success + LLM failure fallback; `updateSession()` ownership validation. Integration test: create session → send first message → verify title updated.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
