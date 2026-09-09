# Chat Session Auto-Title Plan

- [x] c9b7a5c Create `libs/api/ai/workflows/title-generation/` — new Nx library with `project.json`, `tsconfig.json`, `tsconfig.lib.json`, `tsconfig.spec.json`, `package.json` (`@law/title-generation`), `jest.config.cts`, `eslint.config.mjs`, `README.md`. Schema: `titleSchema` (`{ title: z.string().min(1).max(100) }`), system prompt, `generateTitle(content: string, provider: ChatModelProvider)` function. Tests with `FakeChatModelProvider`.

- [x] c9b7a5c Register `@law/title-generation` in `tsconfig.base.json` paths and import `{ buildTitleUserPrompt, generateTitle }` from `@law/title-generation` in `chat.service.ts`.

- [x] c9b7a5c Add `TITLE_CONTENT_MAX_CHARS` (default 300) to `ChatRuntimeConfig` / `chat.config.ts` for the per-attachment text preview budget used as title generation input.

- [x] c9b7a5c Add private `runTitleGeneration(sessionId, content, attachmentIds)` method in `chat.service.ts` — reads attachment `extractedText` (best-effort preview), calls `generateTitle()` via `resolveProvider()`, on success runs `prisma.chatSession.update({ title })` and emits `session.title.updated`; on LLM failure falls back to the truncated message text (skips when content is empty/`(attachment)`).

- [x] c9b7a5c Add `"session.title.updated"` to the `ChatEventType` union in `libs/api/api-interfaces/src/lib/api-interfaces.ts` and add optional `title?: string | null` field to `ChatStreamEvent`.

- [x] c9b7a5c Wire `runTitleGeneration()` into `sendMessage()` — after the `updatedAt` bump and `message.created` emit, check `session.title === "New chat"`, then fire-and-forget `void this.runTitleGeneration(...).catch(...)` before `runTriage`.

- [x] c9b7a5c Add `PATCH /chat/sessions/:id` route to `chat.controller.ts` with `UpdateChatSessionDto` (`title?: string`, `@MaxLength(200)`).

- [x] c9b7a5c Add `updateSession(workspaceId, sessionId, title)` to `chat.service.ts` — validates ownership via `requireSession`, updates title, emits `session.title.updated`, returns `ChatSessionSummary`.

- [x] c9b7a5c Add `updateSession(workspaceId, sessionId, title)` to `ChatApiClient` in `libs/shared/frontend/api-clients/src/lib/api-clients.ts` — `PATCH /chat/sessions/:id` with `{ title }` body.

- [x] c9b7a5c Handle `session.title.updated` SSE event in `assistant.component.ts` `handleEvent()` — `upsertSessionTitle()` maps the session's title in the `sessions` signal array.

- [x] c9b7a5c Unit tests: `title-generation.spec.ts` (schema, prompt builder, runner via `FakeChatModelProvider`) and `chat.service.spec.ts` additions (title auto-generation + event, skip on custom title, truncated-message fallback, `updateSession` success/404). Existing provider-fixture arrays updated for the new title-gen call slot.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.

Verification status: `nx test title-generation`, `nx test api`, `nx lint title-generation`, `nx lint api`, `nx lint web`, `nx build title-generation`, `nx build api`, `nx build web` all pass. (api-clients lint failure is pre-existing and unrelated.)