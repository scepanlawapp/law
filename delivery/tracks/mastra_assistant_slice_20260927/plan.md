# Mastra Assistant Slice — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] Contracts: add `agent-turn` to `WorkflowName` (`@law/contracts`) and `ChatWorkflowName` (`@law/api-interfaces`).
- [x] Triage: optional `history` in `TriageInput`, plus a follow-up rule applied only when history is present. Add specs.
- [x] `@law/mastra`: legal-assistant prompt, `CitationRegistry`, the `search_legal_sources` and `get_case` tools (typed request context), and a `createLegalAssistantAgent` factory. Add specs.
- [x] Chat: `ASSISTANT_ENGINE` and `ASSISTANT_MODEL` in `ChatRuntimeConfig` and `.env.example`.
- [x] Chat: `AssistantContextBuilder` (history, budget, Latin script, case block). Add a spec.
- [x] Chat: `AgentTurnRunner` (agent stream → SSE deltas, throttled persistence, citations, job transitions). Wire it through `WorkflowRunner.run("agent-turn")` and `createInlineWorkflowQueue`.
- [x] Chat: triage passes history and routes ANSWER → `agent-turn` when the engine is `mastra`. Regenerate supports `agent-turn`.
- [x] Web: `agent-turn` counts as an answer in the workflow state, with eng/ser labels. Add a spec.
- [x] Verify: unit tests (mastra, triage, api, web), `nx build api`, lint, and a live OpenRouter smoke test of a two-turn conversation.
- [x] Docs: `bussiness-logic-done-so-far.md`, `AI_ARCHITECTURE.md` current state, epic plan checkboxes.

## Findings

- **Guardrail.** Portir must see the conversation in the agent engine. Without history, short follow-ups ("A da li se taj minimum može smanjiti…?") risk being classified UNCLEAR or NON_LEGAL. History (the last 6 turns, each clipped to 600 characters) and the follow-up rule are added only when history exists, so legacy triage is unchanged.
- **Citations.** Citations get markers per turn through `CitationRegistry`. Earlier answers in the history keep their own `[n]` markers, so the prompt tells the model to cite only markers returned in the current turn. The stored `metadata.citations` keeps the legacy shape, so the UI is unchanged. Markers do not have to be contiguous (for example `[1] [2] [4]` when the model skips a source).
- **Workspace scoping.** `CasesService` takes the workspace from `WorkspaceContextService` (set by `WorkflowProcessor`). `AssistantToolsAdapter` refuses when that workspace differs from the tool's request-context workspace.
- **Persistence.** Assistant text is persisted at most every 500 ms during streaming, plus a final write, instead of one write per token.
- **Deferred.** The "workspace state" block (drafts in the conversation) is deferred to phase 4, where the draft tools make it useful.

## Verification results

- **Unit tests:**
  - `nx test mastra`: 14 tests. Covers the registry, prompt, tools, and an agent loop in which a scripted model calls `search_legal_sources` and then answers with `[1]`.
  - `nx test triage`: 8 tests, 3 of them new for history.
  - `nx test api`: all suites pass. New specs: `assistant-context.builder`, `agent-turn.runner` (full turn with a tool call, unused citations dropped, failure, triage routing with and without the engine), `assistant-tools.adapter` (linked case, workspace mismatch refused, exact/many match), and agent-turn regenerate.
  - `nx test web` on `assistant-workflow-state.spec.ts`: 4 tests, 1 new.
- **Build and lint.** `nx build api` passes. Lint passes for mastra, api, triage, contracts and api-interfaces. `nx lint web` reports 11 problems that already exist on the base branch in files this track does not touch (matter-link, client-detail, documents, sidebar).
- **Live end-to-end run.** The built API ran on port 3111 with `ASSISTANT_ENGINE=mastra LLM_BACKEND=mastra`, against local Postgres (295 indexed Zakon o radu chunks) and Redis, using OpenRouter `google/gemini-3.8-flash`. The session was linked to case 2026-21 and soft-deleted afterwards.
  1. "Koliko traje godišnji odmor…?" ran `triage` → `agent-turn`, streamed 15 deltas, and cited Zakon o radu articles 69, 68 and 70.
  2. The follow-up "A da li se taj minimum može smanjiti ugovorom o radu?" was accepted by triage using history. The answer resolved "taj minimum" and cited articles 8 and 9.
  3. "Ko je protivna strana u ovom predmetu…?" answered correctly from the linked case (ACME Inc., case 2026-21).
  4. A weather question was still refused by Portir, and no agent turn ran.
  5. Regenerating answer 2 queued a new `agent-turn` job and produced a second answer for the same correlation.
  - The API log showed no warnings or errors, and each `WorkflowJob.output.model` recorded the model.
- **Not verified.** Which tool the agent picked for the case question (the case block is also in the instructions). Tool-call telemetry arrives in phase 3.
