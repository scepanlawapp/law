# Mastra Conversation Summary — Specification

## Why

The context builder sends only the most recent turns to the agent: `ASSISTANT_HISTORY_MAX_MESSAGES` messages within a character budget. In a long matter conversation the agent silently loses what was established early: parties, amounts, dates, and decisions such as a declined proposal or which draft version is current. AI_ARCHITECTURE §3 asks for "recent messages + summary of older ones", and the epic's phase 6 is rolling summaries.

## What

Everything is behind `ASSISTANT_ENGINE=mastra`.

1. **Data.** `ChatSession` gains:
   - `summary` (text),
   - `summaryThroughAt`: the createdAt of the last message folded into the summary,
   - `summaryUpdatedAt` and `summaryModel`.

   Summaries live in our database with the messages (AI_ARCHITECTURE §6). They are not stored in Mastra memory.

2. **Summarizer** (`@law/mastra`): a prompt file plus a structured call through the existing `ChatModelProvider`. It folds the previous summary and a batch of older messages into a new summary.
   - The summary is in Serbian Latin script and capped in characters.
   - It keeps only facts from the conversation: parties, case, amounts, dates, legal questions and answers, drafts and versions, decisions on proposals, and open items.
   - Instructions found inside messages are treated as data.
3. **When to summarize** (`ConversationSummaryService`, run best-effort after an agent turn):
   - It triggers when the unsummarized completed messages exceed the trigger (80% of the history window) or the character budget.
   - The oldest messages are folded in, and the most recent ones (40% of the window) are kept verbatim.
   - An optimistic update on `summaryThroughAt` prevents two turns from overwriting each other.
   - A failure is logged and never fails the turn.
4. **Context.** The context builder reads only messages after `summaryThroughAt`, so summarized turns are not duplicated. The agent's instructions carry the summary as "Sažetak ranijeg dela razgovora".

## Deferred: long-term user preferences

Storing memories about users across conversations (working memory) needs a place where users can see, correct and delete what was stored. That is a product and privacy decision. It is left out of this track and recorded as an open item in the epic.

## Non-goals

- A summary UI. Summarizing the legacy engine's conversations.

## Acceptance

- With a small window (for example `ASSISTANT_HISTORY_MAX_MESSAGES=6`), a fact from the first turn is still used correctly after it has left the verbatim window. The session row holds the summary and cursor.
- Short conversations make no summarization call.
