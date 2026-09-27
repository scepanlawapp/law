# AI Architecture & Mastra Migration Brief

This document describes the target architecture for the app's AI/chat features and the plan
for replacing the existing AI features with **Mastra** (TypeScript). Read it fully before
changing any AI-related code.

> Mastra evolves quickly. Before writing Mastra code, check the current docs
> (https://mastra.ai/docs) and the installed `@mastra/*` versions instead of relying on memory.

---

## 1. Goal

A ChatGPT-style assistant that can:
- hold multi-turn conversations,
- perform actions (via our business services),
- create and edit documents,
- continue work on later turns ("shorten the second paragraph", "now send it to the client").

## 2. Core principle

**The agent is stateless. It is a loop that runs once per user message.**
All state lives in our database: conversations, messages, runs, documents, pending actions.
Each turn, the context is rebuilt from the DB and the agent runs again. This is what makes
continuation across turns work.

## 3. Layers

```
1. API / Gateway       REST + SSE/WebSocket streaming, auth, rate limits, uploads. No logic.
2. Chat Orchestrator   Owns one turn: save user message, create Run, call Context Builder
                       → Agent, stream events, persist results. Handles cancel / retry /
                       resume-after-confirmation. ONLY layer that decides what is persisted.
3. Context Builder     Read-only. Builds what the model sees: system prompt, user memory,
                       recent messages + summary of older ones, RAG results, workspace state.
4. Agent Runtime       Mastra Agent(s): LLM → tool calls → results → repeat, until final
                       answer / max steps / confirmation needed.
5. Tool Layer          Mastra tools = thin adapters that call business services.
                       Each tool declares schema, permission and side-effect level.
6. Business Services + DB   Existing domain layer. Must NOT depend on Mastra.
Side: LLM provider (via Mastra model router) | job queue/workers | observability/tracing
```

### Workspace state (key to continuation)
The Context Builder always injects a short block listing entities in this conversation:
```
Documents in this conversation:
- doc_812 "Offer for Client X" (v3)
Pending tasks:
- task_44 "Send offer" (pending)
```
Documents are entities with versions, never just text in chat history. Tool results return
IDs + title + short excerpt, not whole documents. The agent calls `get_document` if it needs more.

## 4. Agents vs workflows

- **Agent** (LLM decides next step): open-ended requests, combining tools.
- **Workflow** (code decides steps): known processes, e.g. `generate_offer` =
  fetch client → fetch price list → fill template → render PDF → save version.

Rules:
1. Start with **one main agent** and many tools.
2. Implement known processes as **Mastra workflows**, exposed to the agent as tools.
3. Add a sub-agent only when an isolated context is really needed (e.g. research over many
   sources). A sub-agent is exposed as a tool.
4. No "router agent + N specialist agents" setup at the start.
5. Agent config is data: `{ model, instructions, tools, maxSteps }`.

## 5. Tools and side effects

Every tool declares `sideEffect: 'none' | 'reversible' | 'irreversible'` and a required permission.

- `none` / `reversible` → execute immediately.
- `irreversible` (send email, delete, pay, external writes) → create a `pending_action`,
  set the Run to `waiting_confirmation`, and emit a `confirmation_required` event. On user
  approval, the orchestrator executes the action and resumes the loop.
  Use Mastra's human-in-the-loop / suspend-resume mechanism where it fits.
- Every irreversible call gets an **idempotency key**.
- Validate tool inputs with Zod and check authorization inside the executor, not in the prompt.

## 6. State ownership (decision)

**Our database is the source of truth** for conversations and messages.
- If Mastra memory is used, configure it on our Postgres, with `threadId = conversation.id`
  and `resourceId = user.id`, and make sure there's no duplicate message storage that can
  diverge. If that isn't cleanly possible, keep our own tables and pass the built context to the agent.
- Decide this explicitly in the first migration step and record the decision here.

**Decision (2026-09-27):** keep our own tables. `ChatMessage` and the related Prisma models stay the only
message store. A Context Builder builds the agent input from them: recent messages, a summary of older
turns, the linked case, and the drafts in the conversation. That input is passed to `agent.stream(messages)`.
Mastra `Memory` is **not** used for message history. Mastra storage (`@mastra/pg` `PostgresStore`) is
configured in a separate Postgres schema, `mastra`, and holds only workflow and approval snapshots and
traces. Prisma manages only `public`, so it sees no migration drift. Existing SSE, replay and the UI keep
working unchanged.

## 7. Data model (target)

| Table | Contents |
|---|---|
| conversations | id, user_id, title, summary, created_at |
| messages | id, conversation_id, run_id, role (user/assistant/tool), content (JSON content blocks: text, tool_call, tool_result, attachment refs) |
| runs | id, conversation_id, status (running/waiting_confirmation/done/failed/cancelled), model, tokens, error, started_at, finished_at |
| tool_calls | id, run_id, tool_name, input, output, status, duration_ms |
| pending_actions | id, run_id, tool_call_id, payload, status (pending/approved/rejected/expired), expires_at |
| artifacts | id, conversation_id, type (doc/pdf/sheet), title, current_version |
| artifact_versions | id, artifact_id, version, content or storage_url, created_by_run |
| files + embeddings | uploads and RAG chunks (pgvector) |
| user_memory | long-term facts about the user across conversations |

Adapt names to the existing schema; don't create duplicates of tables that already exist.

## 8. Streaming events (API contract)

`token`, `tool_started`, `tool_finished`, `document_updated`, `confirmation_required`,
`run_status`, `error`, `done`.

## 9. Target folder structure (adapt to repo conventions)

```
/api            routes, SSE/WS, auth
/orchestrator   run service, conversation service, confirmation service
/context        context builder, summarizer, retriever, workspace state
/mastra         Mastra instance, agents/, tools/, workflows/
/llm            (only if something is needed beyond Mastra's model router)
/workers        queue consumers for long jobs
/domain         business services + repositories (no Mastra imports)
/observability  tracing per run and tool call, token costs
```

**Nx mapping for this repo:**

| Target | Location |
|---|---|
| api | `libs/api/features/chat` controller + SSE (existing) |
| orchestrator | `libs/api/features/chat`: `agent-turn.runner.ts`, `pending-action.service.ts` (next to `WorkflowRunner` until cleanup) |
| context | `libs/api/features/chat/context-builder.service.ts` |
| mastra | new lib `libs/api/ai/mastra` (`@law/mastra`): `mastra.factory.ts`, `agents/`, `tools/`, `workflows/`, `prompts/` |
| llm | `@law/llm` (transitional `MastraChatModelProvider`; removed in cleanup) |
| workers | BullMQ `workflow` queue processors inside the API process (existing) |
| domain | `libs/api/features/*` services + Prisma (no Mastra imports) |
| knowledge / RAG | `@law/knowledge` + `LegalKnowledgeService` (existing pgvector) |

## 10. Migration plan

Incremental, no big-bang rewrite. Existing features keep working until replaced.

1. **Audit.** Find all existing AI features: where the LLM is called, prompts, tool/function
   calls, how conversation state is stored, streaming, and which SDKs are used. Write the
   findings to a new "Current state" section at the end of this file.
2. **Plan.** Map each existing feature to agent / workflow / tool. Decide state ownership (§6).
   Propose the order of migration and get approval before large changes.
3. **Foundation.** Install Mastra, set up the Mastra instance, model config, storage, and
   tracing. Add missing tables/migrations (runs, tool_calls, pending_actions, artifacts).
4. **First vertical slice.** One main agent plus 1–2 read-only tools, end to end:
   API → orchestrator → context builder → agent → streaming → persistence.
5. **Migrate features one by one.** Each goes behind a feature flag if the risk is non-trivial.
   Remove old code only after the replacement is verified.
6. **Confirmations.** Add irreversible tools with the pending-action flow.
7. **Documents.** Versioned artifacts plus workspace state in the context.
8. **Summarization, long-term memory, RAG.**
9. **Cleanup.** Remove old AI SDK code and dead prompts; update this doc.

## 11. Conventions

- Business services never import Mastra. Tools call services, not the reverse.
- One tool per file, with a Zod schema and a clear description written for the model.
- Prompts live in files, not inline in route handlers.
- Log every run and tool call (inputs, outputs, duration, tokens).
- Write tests for tools and workflows (deterministic parts) and a few end-to-end agent tests
  with a mocked model.

## 12. Open questions

- Which LLM provider(s)/models? Is a fallback provider needed?
- Durable execution for long or waiting runs: Mastra suspend/resume alone, or a queue
  (e.g. BullMQ/Inngest/Temporal)?
- Where are generated files (PDF/DOCX) stored?

**Answers (2026-09-27):**
- **Provider:** OpenRouter through the Mastra model router (`openrouter/<model>`), using the existing
  `OPENROUTER_API_KEY`. Model choice is configuration: a small model for the guardrail and titles, a
  stronger one for the agent and drafting. OpenRouter already provides routing and fallback, so a second
  provider is not needed yet.
- **Durable execution:** keep BullMQ (queue `workflow`). One `agent-turn` job runs one turn, and
  resuming after an approval enqueues an `agent-resume` job. Mastra suspend/resume snapshots live in
  the `mastra` schema.
- **Generated files:** draft text is stored in the DB (`DraftResult`, versioned through `previousDraftId`).
  DOCX is rendered on export by `@law/documents`. The document storage groundwork
  (`Document`/`StoredFile`) is the future home for stored files.

---

## Current state

Audited on 2026-09-27 (delivery track `assistant_mastra_migration_20260927`).

**Phase 1 is done** (`mastra_foundation_20260927`):
- `@mastra/core` and `@mastra/pg` are installed.
- The `@law/mastra` library adds model config, `MastraChatModelProvider` and the `createLawMastra` factory.
- `LLM_BACKEND=mastra` runs the existing pipeline on Mastra models with the same prompts and schemas. The default is still `legacy`.
- Jest needs the root `jest.esm-interop.cjs` helper to load Mastra. See the findings in that track's `plan.md`.

**Phase 2 is done** (`mastra_assistant_slice_20260927`). With `ASSISTANT_ENGINE=mastra`, triage sees the recent conversation and routes ANSWER to an `agent-turn` job. There, `AssistantContextBuilder` → `legalAssistant` (tools `search_legal_sources`, `get_case`, typed `RequestContext`, per-turn `CitationRegistry`) → streamed `message.delta` → persisted answer with citations. Gap 1 (no multi-turn context) is closed for answers. Drafting still uses the legacy chain.

**Phase 3 is done** (`mastra_run_telemetry_20260927`). `WorkflowJob` records `model`, `inputTokens`, `outputTokens`, `startedAt` and `finishedAt`. The new `AgentToolCall` table and the `tool.started` / `tool.finished` events cover gap 5 for the agent path, and the chat UI shows tool steps. Opt-in `MASTRA_TRACING` exports spans to the `mastra` schema; Mastra's own message and thread tables stay unused. The spans contain prompts and answers.

**Phase 4 is done** (`mastra_drafting_workflow_20260927`). Drafting runs as Mastra workflows, `lawsuit-drafting` (extract-brief → ground-and-draft) and `draft-revision`. The agent reaches them through the `draft_lawsuit` and `revise_draft` tools, and reads drafts with `get_draft` and `list_conversation_drafts`. Persistence goes through the legacy job and row contract (`AssistantDraftingService`). The workspace-state block lists the conversation's drafts (§3). In the mastra engine, every legal request is an agent turn. Gap 4 is closed.

**Phase 5 is done** (`mastra_confirmations_20260927`). §5 is implemented with our own `PendingAction` table rather than Mastra `requireApproval`: resuming a suspended Mastra run needs Mastra-stored snapshots, which conflicts with §6, and approvals must run as deterministic service code with the lawyer as actor.
- `ASSISTANT_TOOL_SIDE_EFFECTS` declares `none`, `reversible` or `confirm` for every tool.
- The `confirm` tools (`link_case`, `create_deadline`, `create_tasks_from_brief`) only store validated proposals, with idempotency keys and a 24 h expiry.
- The run waits in `WAITING_CONFIRMATION`. Approve and decline endpoints claim the proposal atomically, execute it, and enqueue `agent-resume`.
- Events: `confirmation.required` / `confirmation.updated`.

### LLM access
- `@law/llm` (`libs/api/ai/llm`): our own `ChatModelProvider` interface.
  - `completeStructured(schema, messages)`: OpenRouter `/chat/completions` with
    `response_format: json_object` and `temperature: 0`, followed by `JSON.parse` and zod validation.
    Nothing retries or repairs invalid JSON.
  - `streamText(messages)`: parses the SSE stream by hand and yields text deltas.
  - It supports no tool calling, records no token usage, and uses one model (`OPENROUTER_MODEL`,
    default `openai/gpt-4o-mini`) for every task.
  - `FakeChatModelProvider` is used in tests.
- Provider resolution: `resolveChatModelProvider` (`libs/api/features/chat/src/lib/chat-model.util.ts`).
- Embeddings: `@law/knowledge` `OpenRouterEmbeddings` (`BAAI/bge-m3`, 1024 dimensions).
  `LegalKnowledgeService.search` runs a raw pgvector cosine query over `LegalChunk`.
- Stubs: `@law/ollama` and `@law/n8n` are adapter stubs. `@law/evaluation` and `@law/review` return
  placeholder strings.

### Features, prompts, structured output
Prompts live in `libs/api/ai/workflows/*/src/lib/prompts.ts`. Context builders enforce character budgets in
`context.ts`, and zod schemas are in `schema.ts`.

| Feature | Where | Kind | Notes |
|---|---|---|---|
| Triage ("Portir") | `@law/triage` | structured | LEGAL / NON_LEGAL / UNCLEAR, intent ANSWER / DRAFT, language sr / en. Sees only the current message and attachment names. |
| Answering | `WorkflowRunner.runAnswering` (prompt inline) | streaming | Input is the current message, the linked case block and the RAG grounding block. `[n]` markers; used citations go to `ChatMessage.metadata.citations`. Supports regeneration. |
| Brief extraction | `@law/brief-extraction` + `@law/extraction` | structured | Extracts attachment text (PDF, DOCX, XLSX, OCR), then builds a `BriefResult`, persisted in `BriefExtractionResult`. |
| Drafting | `@law/drafting` + `@law/legal-grounding` | structured | Deterministic RAG queries from the brief, then a lawsuit JSON (`documentText`, `warnings`, `usedCitations`), stored in `DraftResult` + `DraftCitation`. Lawsuits only. |
| Draft revision | drafting job with `previousDraftId` + `reviewerNote` | structured | Started from the draft review UI (request changes), not from chat. |
| Title generation | `@law/title-generation`, called from `ChatService` | structured | Fire-and-forget; does not go through the queue. |
| Matter link | `MatterLinkService` | deterministic | Applies a brief to a case or client. Tasks are proposed from `missingFields` and `evidence`. No LLM. |

### Orchestration and streaming
1. `ChatService.sendMessage` saves the `ChatMessage` and attachments (disk), then creates a `WorkflowJob(triage)` and
   enqueues it on the BullMQ queue `workflow`.
2. `WorkflowProcessor` calls `WorkflowRunner.run` (about 1000 lines). It is a code-driven router: each step inserts the
   next `WorkflowJob` row and enqueues it (triage → answering | brief-extraction → drafting).
   LLM and zod failures are recorded as `FAILED`. Infrastructure errors are retried by BullMQ.
3. Progress is reported through `WorkflowJob.status` and `output.progressStage`. Events go through the in-memory RxJS
   `ChatEventBus` to SSE: `message.created/started/delta/updated`, `attachment.updated`,
   `triage.started/completed`, `job.queued/updated`, `draft.updated`, `session.*` and `error`, plus a replay endpoint.
4. Drafts pass a human approval gate (`DraftApprovalStatus`) and are exported to DOCX (`@law/documents`), with
   Cyrillic script available on export.

### Conversation state
Postgres (Prisma) holds all of it: `ChatSession` (optional `caseId`), `ChatMessage` (role, content, status,
`metadata` JSON), `ChatAttachment` (extracted text), `WorkflowJob` (input and output JSON),
`BriefExtractionResult`, `DraftResult` (version chain) and `DraftCitation` (citation snapshots).

### Gaps against this document
1. **No multi-turn context.** Answering and triage see only the current message (§2, §3).
2. **No tools and no agent loop.** The assistant can neither read business data on demand nor propose actions (§4, §5).
3. **Router shape.** Triage and the fixed chain form a "router + specialists" design (§4). The non-legal gate is a product rule and stays as a guardrail.
4. **Documents are not in chat context.** There is no workspace-state block, and revision works only from the review UI (§3).
5. **No run or tool telemetry.** No tokens, cost or durations are recorded (§11).
6. **No repair for structured output.** Invalid JSON from the model is not retried.
7. **One DB write per streamed token** during answering.
8. **In-process event bus.** `ChatEventBus` only works because the workers run inside the API process.

### Mapping to Mastra
| Today | Mastra |
|---|---|
| `ChatModelProvider` | Model router `openrouter/<model>`, with a transitional `MastraChatModelProvider` |
| Triage | Guardrail before the agent (input processor or structured call) |
| Answering | Main agent `legalAssistant` (`agent.stream`) |
| Brief extraction + grounding + drafting | Workflow `lawsuitDraftingWorkflow`, exposed as the tool `draft_lawsuit` |
| Draft revision | Tool `revise_draft` (reversible; new `DraftResult` version) |
| Title generation | Small structured `generate` call |
| Matter link apply / tasks / deadlines | `requireApproval` tools using the pending-action flow |
| Read context | Tools `search_legal_sources`, `get_case`, `get_draft`, `list_conversation_drafts`, `get_attachment_text` |

Data model deltas: reuse `WorkflowJob` as the run record (`agent-turn`, plus `WAITING_CONFIRMATION`, tokens and
timings), add `AgentToolCall` and `PendingAction`, reuse `DraftResult` as the artifact, and add
`ChatSession.summary`. The phased order is in
`delivery/tracks/assistant_mastra_migration_20260927/plan.md`.
