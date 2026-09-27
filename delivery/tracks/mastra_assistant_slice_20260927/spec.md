# Mastra Assistant Slice — Specification

## Why

The assistant answers each message in isolation. Triage and answering both see only the current message, so follow-ups ("a šta ako je poslodavac u stečaju?", "objasni kraće") lose context. Retrieval of legal sources is also fixed at one query built from the raw user text, and the answer cannot look up case data. This slice is the first end-to-end use of the target architecture (AI_ARCHITECTURE.md §3): context builder → agent → tools → streaming → persistence.

## What

Everything is behind `ASSISTANT_ENGINE=legacy|mastra` (default `legacy`). With `mastra`:

1. **Context-aware guardrail.** Portir triage also receives the recent conversation, so a follow-up to a legal conversation is classified as legal. With no history, the prompt is unchanged.
2. **ANSWER intent goes to an `agent-turn` job** instead of `answering`. The DRAFT intent keeps the existing brief-extraction → drafting pipeline until phase 4.
3. **Context builder** (`libs/api/features/chat`):
   - It reads the session's recent completed `ChatMessage` rows up to and including the triggering user message. This keeps regeneration correct, because later messages are excluded.
   - Text is converted to Latin script (`toLatin`), budgeted by message count and characters (oldest dropped first), and attachment names are noted.
   - It adds the linked case block (reusing `MatterLinkService.caseContextBlock`).
4. **The `legalAssistant` agent** (`@law/mastra`):
   - Instructions live in a prompt file. It replies in the language detected by triage.
   - It runs with `maxSteps` capped.
   - Tools are thin adapters. They read `workspaceId` and the session's `caseId` from Mastra `RequestContext`:
     - `search_legal_sources(query)` calls `LegalKnowledgeService.search` through `@law/legal-grounding`. A per-turn citation registry keeps `[n]` markers stable and unique across several searches.
     - `get_case(reference?)` returns the linked case when no reference is given, otherwise a case-number/name search through `CasesService`. It is read-only.
5. **Streaming and persistence:**
   - An `ASSISTANT` message with `outcome: "ANSWER"` is created. Text deltas are sent as `message.delta`, and DB writes are throttled instead of one write per token.
   - The citations actually used are stored in `metadata.citations` in the same shape as today, so the UI's citations, feedback and regenerate work unchanged.
   - Job progress uses stage `PREPARING_ANSWER`.
6. **Regenerate and retry** work for `agent-turn` jobs, reusing the source job's workflow name.
7. **Shared contracts and web:**
   - The new workflow name `agent-turn` in `ChatWorkflowName` / `WorkflowName`.
   - The assistant activity UI treats it as an answer, with an i18n agent label in eng/ser.
8. **Model:** `ASSISTANT_MODEL` (optional) overrides `OPENROUTER_MODEL` for the agent.

## Non-goals

- Tool activity events and token accounting (phase 3), drafting as a workflow and draft tools (phase 4), write tools and confirmations (phase 5), summaries (phase 6).

## Acceptance

- With `ASSISTANT_ENGINE=mastra`, a follow-up question is answered using the earlier turns. Answers cite only sources returned by `search_legal_sources`, and the citations appear in the UI.
- With the default `legacy`, behavior is unchanged and the existing tests pass.
- Tools are scoped to the workspace from the request context and never write.
