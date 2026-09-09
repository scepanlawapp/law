# Chat Session Auto-Title

- **Track ID:** `chat_session_title_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Track complete (commit `c9b7a5c`). A new `@law/title-generation` workflow library (Zod schema, system prompt, `buildTitleUserPrompt`, `generateTitle`) generates concise titles from the first user message plus per-attachment extracted-text previews (`TITLE_CONTENT_MAX_CHARS`). `ChatService.sendMessage` fires it asynchronously when the session title is still `"New chat"`; the title is persisted and pushed to the sidebar via a new `session.title.updated` SSE event handled in `assistant.component.ts`. A `PATCH /chat/sessions/:id` endpoint (`updateSession`) supports manual rename with `ChatApiClient.updateSession`. All unit tests, lint, and api/web builds pass.
