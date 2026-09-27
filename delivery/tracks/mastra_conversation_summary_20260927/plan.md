# Mastra Conversation Summary — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] Prisma: `ChatSession.summary`, `summaryThroughAt`, `summaryUpdatedAt`, `summaryModel`, and a migration generated offline and applied with `migrate deploy`. Check whether the demo seed needs changes.
- [x] `@law/mastra`: summary prompt, schema, `summarizeConversation`, and a `conversationSummary` block in the agent instructions and request context. Add specs.
- [x] Chat: `ConversationSummaryService` (trigger, keep-recent, optimistic cursor, best-effort), context builder reading after the cursor and returning the summary, and the runner calling refresh after the turn. Add specs.
- [x] Verify: tests, build, lint, and a live end-to-end run with a small window (early fact recalled from the summary, session row checked).
- [x] Docs: `bussiness-logic-done-so-far.md`, `AI_ARCHITECTURE.md`, epic plan (phase 6, with user preferences deferred).

## Findings

- **Cursor.** The context builder now reads only messages after `summaryThroughAt`, so summarized turns are never duplicated. The trigger is 80% of the window and 40% is kept verbatim, which leaves room for the next turn's messages before the window overflows. The character budget is enforced too: a few very long messages also trigger folding.
- **Concurrency.** The cursor update is an `updateMany` conditioned on the previous `summaryThroughAt`. If a parallel refresh already advanced it, the update is a no-op.
- **Timing.** The refresh runs after the answer is saved and the job is marked done, so the user never waits for it. Failures only log a warning.
- **Privacy.** The summary holds client facts just like the messages. It lives on `ChatSession` in our database and follows the session's soft delete. Nothing goes to Mastra memory.
- **Deferred.** Long-term user preferences (working memory) need a UI for viewing and deleting what was stored. That decision is recorded as open in the epic plan.

## Verification results

- **Unit tests:**
  - `nx test mastra`: 34 tests (summary prompt, cap, rejects empty; summary block in the agent instructions).
  - `nx test api`: 169 tests. New ones: the `conversation-summary.service` spec (6 tests: no call while it fits, folds oldest and keeps recent, extends from the cursor, character-budget trigger, never throws, optimistic no-op), context builder cursor and summary, and the runner refreshing only after a completed turn.
- **Build and lint.** `nx build api` passes. Lint passes for api and mastra.
- **Migration.** `20260927220000_chat_session_summary` was generated offline and applied locally with `prisma migrate deploy`. The demo seed creates no chat sessions, so it needs no change.
- **Live end-to-end run.** Built API with `ASSISTANT_ENGINE=mastra LLM_BACKEND=mastra ASSISTANT_HISTORY_MAX_MESSAGES=6` (trigger above 4, keep 2), `gemini-3.8-flash`, no linked case.
  1. Turn 1 gave the client facts: Milan Jovanović, driver at Beta Transport d.o.o. Kragujevac, net salary 85.000 RSD. Turns 2 and 3 were legal questions.
  2. After turn 3, the 4 oldest messages (turns 1–2) were folded. The session row got a 958-character factual summary and a cursor right after turn 2's answer.
  3. Turn 4, "Podseti me: kako se zove moj klijent, gde radi i kolika mu je plata?", was answered correctly with all three facts. Its verbatim context held only turn 3 and the question, so the facts came from the summary.
  4. After turn 4, 4 messages were unsummarized, which does not exceed the trigger, so no extra summarization call ran.
  - The API log had no warnings or errors, and the session was soft-deleted.
