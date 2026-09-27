# Mastra Run Telemetry — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] Prisma: `WorkflowJob` telemetry columns, the `AgentToolCall` model and relations, and a migration. The seed is unaffected, since it creates no workflow jobs.
- [x] Contracts: `tool.started`/`tool.finished` events, `AgentToolCallSummary`, `ChatSessionDetail.toolCalls`, and optional telemetry fields on `WorkflowJobResponse`.
- [x] API: `startedAt`/`finishedAt` in `WorkflowRunner.transitionJob`, telemetry fields in the mappers, and tool calls in the session detail.
- [x] API: `AgentTurnRunner` on `fullStream`, with tool-call persistence and events, usage and model on the job, and output truncation.
- [x] `@law/mastra`: tool-call labels, plus opt-in observability in `createLawMastra` and agent registration behind `MASTRA_TRACING`.
- [x] Web: tool steps in the workflow activity state and template, and eng/ser i18n.
- [x] Tests: runner (tool rows, events, usage), mapper/session detail, web state, and the mastra factory with tracing.
- [x] Verify: tests, build, lint, migration applied locally, and a live end-to-end run checking job and tool rows, SSE tool events and `mastra` traces.
- [x] Docs: `bussiness-logic-done-so-far.md`, `AI_ARCHITECTURE.md`, epic plan.

## Findings

- **Stream consumption.**
  - `fullStream` delivers `tool-call` → `tool-result` / `tool-error` in order, so a `RUNNING` row is written before its result.
  - A tool that throws becomes a `FAILED` row, and the model continues the turn.
  - Rows still open when the turn fails are closed as `FAILED`.
- **Usage.** `stream.totalUsage` sums all steps (model call → tool → model call). The legacy `ChatModelProvider` still reports no usage (out of scope).
- **Payload storage.** Tool inputs and outputs are stored as JSON, capped at 8,000 characters as `{ truncated, preview }`. Mastra's internal `__mastraMetadata` is removed from the args.
- **Events.** AI_ARCHITECTURE's `run_status` maps to the existing `job.updated`, which now carries `model`, token counts, `startedAt` and `finishedAt`. No extra event was added.
- **Tracing.**
  - With `@mastra/observability`, Mastra initializes storage eagerly when the instance is created, so tracing is opt-in (`MASTRA_TRACING=true`).
  - Unit tests inject Mastra's `InMemoryStore` through a `storage` seam in `createLawMastra`.
  - When the DB is unreachable, Mastra only logs warnings and never fails the request.
  - The first traced run creates 43 `mastra_*` tables in the `mastra` schema, none in `public`. `mastra_messages` and `mastra_threads` stay empty, which confirms the state-ownership decision (no duplicate message storage).
- **Web target.** The web build target lacks `Array.prototype.at`, so index access is used instead.

## Verification results

- **Unit tests:**
  - `nx test mastra`: 19 tests. New ones cover the factory (in-memory store, observability only when tracing, agent registration) and the tool-call label and count helpers.
  - `nx test api`: all suites pass. `agent-turn.runner.spec` checks the tool row, event order, usage and model, and a failing tool that does not fail the turn. The session-detail spec checks the `toolCalls` mapping, and the runner spec checks `startedAt`/`finishedAt`.
  - `nx test web` (assistant): 34 tests. New ones cover tool steps, the running-tool title, that a late `started` event does not reopen a finished call, and restoring tool steps after a reload.
- **Build and lint.**
  - `nx build api` and `nx build web` pass. `nx build web` shows only the existing bundle-budget warnings.
  - Lint passes for mastra, api, contracts and api-interfaces. `nx lint web` still reports the same 11 problems that already exist on the base branch.
- **Migration.** `20260927160000_agent_run_telemetry` was generated offline with `prisma migrate diff`, applied locally with `prisma migrate deploy`, and `prisma migrate status` reports the schema up to date.
- **Live end-to-end run.** The built API ran with `ASSISTANT_ENGINE=mastra LLM_BACKEND=mastra MASTRA_TRACING=true` against `gemini-3.8-flash`, three turns, with the session linked to case 2026-21 and soft-deleted afterwards.
  - SSE delivered `tool.started` then `tool.finished` for each call:
    - `search_legal_sources` "Zakon o radu dužina godišnjeg odmora": 4 results, 467 ms
    - `search_legal_sources` "Zakon o radu ugovor o radu manja prava od zakona": 4 results, 381 ms
    - `get_case` (linked case): 1 result, 12 ms. This confirms the phase 2 open question: the agent does call `get_case`.
  - `GET /chat/sessions/:id` returned the same three `toolCalls`.
  - The `agent-turn` jobs recorded the model and tokens (in/out 2100/414, 2803/379, 2962/372). All jobs have `startedAt` and `finishedAt`.
  - `mastra.mastra_ai_spans` holds 3 `agent_run`, 3 `tool_call`, 3 `model_generation` and 6 `model_step` spans, among others.
  - The API log had no warnings or errors.
