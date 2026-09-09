# Chat Session Auto-Title Specification

## Goals

- Automatically generate a concise, descriptive title (3–8 words) for each chat session based on the first user message.
- Use the same LLM infrastructure (`ChatModelProvider.completeStructured`) already used by triage/brief-extraction/drafting.
- Combine the typed message text with a truncated preview of attached file content (first ~300 chars per file) to produce richer titles.
- Push the generated title to the frontend in real time via a new `session.title.updated` SSE event, so the sidebar updates without a page refresh.
- Add a `PATCH /chat/sessions/:id` endpoint so users can manually rename sessions.
- Follow the existing async fire-and-forget pattern (same as `runTriage`) to avoid blocking the message response.

## Non-goals

- Title editing via the sidebar inline edit UI (future track).
- Title regeneration or re-summarization when the conversation evolves.
- Title persistence on the `WorkflowJob` model — titles live on `ChatSession` only.
- Any changes to the session creation flow — `createSession()` continues to default to `"New chat"`.

## Context model

- Input is the first `USER` message's `content` field plus the first ~300 characters of extracted text from each `ChatAttachment` on that message.
- Title generation is triggered only when `session.title === "New chat"` (the default). Sessions created with a user-supplied title are never overwritten.
- The LLM receives a system prompt instructing it to produce a short, factual title in Serbian or English (matching the user's language), plus a structured JSON response `{ "title": "..." }`.
- A Zod schema validates the response; on failure the title falls back to a truncated version of the user message.

## Users

- **Primary:** Any workspace member who starts a new chat session — their sidebar shows a meaningful title instead of "New chat".
- **Secondary:** Users who want to rename sessions manually via the context menu / edit affordance.
