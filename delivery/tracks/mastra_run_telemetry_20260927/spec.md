# Mastra Run Telemetry — Specification

## Why

AI_ARCHITECTURE.md §11 requires every run and tool call to be logged with inputs, outputs, duration and tokens. Today a run stores only its status and a free-form `output`. The agent's tool calls from phase 2 are invisible to users and operators, so we cannot see what the assistant looked up, how long it took, or what it cost.

## What

1. **Run record.** `WorkflowJob` gains `model`, `inputTokens`, `outputTokens`, `startedAt` and `finishedAt`.
   - `startedAt` is set when a job first moves to RUNNING, and `finishedAt` when it reaches COMPLETED or FAILED. This applies to all workflows.
   - Tokens and model are recorded for `agent-turn` runs, using Mastra's total usage across all steps.
2. **`AgentToolCall` table.** One row per tool call: workspace, job, session, Mastra `toolCallId`, tool name, input, output (truncated), status (`RUNNING`/`COMPLETED`/`FAILED`), error, `durationMs`, `startedAt`, `finishedAt`. Rows are deleted with their job.
3. **Streaming contract.**
   - New `tool.started` and `tool.finished` events carry an `AgentToolCallSummary`: id, job, tool, status, short human label (e.g. the search query), timings, and result count.
   - `ChatSessionDetail.toolCalls` returns them after a reload.
   - Run status stays on `job.updated`. AI_ARCHITECTURE's `run_status` maps to it, so no separate event is added.
4. **`AgentTurnRunner`** consumes Mastra's `fullStream` instead of `textStream`. Text deltas behave as before. `tool-call` and `tool-result` chunks create or finish `AgentToolCall` rows and emit the events. `finish` provides usage.
5. **Web.**
   - The assistant activity card lists tool calls as steps under the agent turn (e.g. "Pretraga propisa: „Zakon o radu godišnji odmor“ · 3 izvora").
   - While a tool is running, the card title shows it ("Pretražujem propise…").
   - i18n in eng and ser.
6. **Opt-in Mastra tracing** (`MASTRA_TRACING=true`, default off):
   - `createLawMastra` registers `@mastra/observability` with the default exporter into the Mastra storage in the separate `mastra` Postgres schema.
   - The agent is registered on that Mastra instance so its runs are traced.
   - When the flag is off, no Mastra storage is initialized.

## Non-goals

- Token accounting for the legacy `ChatModelProvider` pipeline. It would need interface changes, and that pipeline is retired in phase 7.
- Cost in currency, and dashboards.

## Acceptance

- An `agent-turn` job row has model, tokens, `startedAt` and `finishedAt`. Its tool calls exist as rows with duration and status.
- The chat UI shows tool steps live and after a reload. Legacy runs look unchanged.
- With `MASTRA_TRACING=true`, traces appear in the `mastra` schema. With it unset, nothing is created there.
