# Assistant Mastra Migration — Plan

Each phase below 0 gets its own child track and branch (`parent_track_id: "assistant_mastra_migration_20260927"`).

## Phase 0 — Audit and plan
- [x] Audit the current AI features and write the "Current state" section in `AI_ARCHITECTURE.md`.
- [x] Record the state-ownership decision (§6) and the answers to the open questions (§12) in `AI_ARCHITECTURE.md`. Adapt the folder structure (§9) to the Nx layout.
- [x] Create this epic track (`index.md`, `spec.md`, `plan.md`, `metadata.json`) and link it from `delivery/index.md`.

## Phase 1 — Foundation spike ([mastra_foundation_20260927](../mastra_foundation_20260927/index.md))
- [x] Install `@mastra/core` and `@mastra/pg`, checking the current docs and versions first.
- [x] Confirm Mastra works under the Nest webpack/CommonJS API build and under ts-jest (ESM interop, `transformIgnorePatterns` or a dynamic `import()`).
- [x] Confirm zod compatibility (the repo is on zod 3.25.x).
- [x] Add the Nx lib `libs/api/ai/mastra` (`@law/mastra`): Mastra factory, `PostgresStore` in the `mastra` schema, model config as data. Tracing is deferred to phase 3 (it needs `@mastra/observability`).
- [x] Add `MastraChatModelProvider`, which implements `ChatModelProvider`. Put it behind a flag so the legacy pipeline runs on Mastra models with no behavior change.

## Phase 2 — First vertical slice ([mastra_assistant_slice_20260927](../mastra_assistant_slice_20260927/index.md))
- [x] Add a `ContextBuilder` in `libs/api/features/chat`: recent `ChatMessage` history and the linked case block. The workspace-state block (drafts) moves to phase 4.
- [x] Add a `legalAssistant` agent with the read-only tools `search_legal_sources` and `get_case`. The tools read workspace and user from `requestContext`.
- [x] Add the Portir guardrail before the agent.
- [x] Add an `AgentTurnRunner` (BullMQ `agent-turn`) that streams to the existing SSE, persists the answer and its citations, and batches delta writes.
- [x] Add the `ASSISTANT_ENGINE=legacy|mastra` flag in `ChatRuntimeConfig`.

## Phase 3 — Run telemetry ([mastra_run_telemetry_20260927](../mastra_run_telemetry_20260927/index.md))
- [x] Wire `@mastra/observability` tracing into `createLawMastra`, opt-in via `MASTRA_TRACING`.
- [x] Add to `WorkflowJob`: `model`, `inputTokens`, `outputTokens`, `startedAt`, `finishedAt`. Add the `AgentToolCall` table and a migration, and update the seed.
- [x] Add the `tool.started` and `tool.finished` events to `ChatEventType` (`run.status` maps to the existing `job.updated`), and show tool activity in the chat UI.

## Phase 4 — Drafting workflow ([mastra_drafting_workflow_20260927](../mastra_drafting_workflow_20260927/index.md))
- [x] Build `lawsuitDraftingWorkflow` (extract attachments → brief → grounding → draft → persist), reusing the existing prompts, schemas and grounding helpers.
- [x] Add the tools `draft_lawsuit`, `revise_draft`, `get_draft` and `list_conversation_drafts`.
- [x] Add the drafts in the conversation to the workspace-state context. The draft approval gate is unchanged.

## Phase 5 — Confirmations ([mastra_confirmations_20260927](../mastra_confirmations_20260927/index.md))
- [x] Add the `PendingAction` table, the `WAITING_CONFIRMATION` status and idempotency keys.
- [x] Add the `requireApproval` tools `link_case`, `create_tasks_from_brief` and `create_deadline`. They call the existing services and write activity-log rows.
- [x] Add the approve/decline endpoints, the `confirmation.required` event and card in the chat UI, and `agent-resume` jobs.

## Phase 6 — Summarization and memory
- [ ] Add `ChatSession.summary` with rolling summaries of older turns.
- [ ] Optionally add long-term user preferences (working memory).

## Phase 7 — Cleanup
- [ ] Remove the legacy `WorkflowRunner` paths, the triage router role, the OpenRouter fetch adapter and the unused stubs.
- [ ] Update `.github/bussiness-logic-done-so-far.md`, the "Chat jobs" section of AGENTS.md, and `AI_ARCHITECTURE.md`.

## Verification (phase 0)
- The track files exist, `metadata.json` parses as JSON, and `delivery/index.md` links to `index.md`.
- No code, schema or dependency changes were made in phase 0.
