# Assistant Mastra Migration — Specification

## Why

The assistant works today as a fixed, code-driven chain of single-shot LLM calls: triage → (answering | brief-extraction → drafting). The chain cannot:

- **hold a conversation.** Answering and triage see only the current message, so follow-ups such as "skrati drugi pasus" have no context.
- **use tools.** It cannot read case, calendar or draft data on demand, and it cannot propose actions (tasks, deadlines, linking a case).
- **revise drafts from chat.** Revision is only possible from the draft review UI.
- **report usage or failures in detail.** There is no per-run token or cost tracking and no per-tool timing, and invalid JSON from the model is not retried.

[AI_ARCHITECTURE.md](../../../AI_ARCHITECTURE.md) describes the target: a stateless agent loop per user message, with all state kept in our database. We will get there on the Mastra framework and replace the hand-rolled OpenRouter adapter.

## What

### Current state (audit)
The full audit is in the "Current state" section of [AI_ARCHITECTURE.md](../../../AI_ARCHITECTURE.md#current-state). In short:

- **LLM access:** `@law/llm` `ChatModelProvider` (OpenRouter `fetch`, `json_object` + zod, hand-parsed SSE). One model is used for everything. There is no tool calling.
- **Features:**
  - Portir triage (`@law/triage`)
  - streamed answering (inline in `WorkflowRunner`)
  - brief extraction (`@law/brief-extraction` + `@law/extraction`)
  - lawsuit drafting with pgvector grounding (`@law/drafting`, `@law/legal-grounding`, `LegalKnowledgeService`)
  - draft revision from the review UI
  - title generation (`@law/title-generation`)
  - Matter link is deterministic and uses no LLM.
- **Orchestration:** BullMQ queue `workflow` → `WorkflowProcessor` → `WorkflowRunner`. Each step inserts the next `WorkflowJob` row. Events go through the in-memory `ChatEventBus` to SSE.
- **State:** `ChatSession`, `ChatMessage`, `ChatAttachment`, `WorkflowJob`, `BriefExtractionResult`, `DraftResult` (version chain + approval gate), `DraftCitation`.

### Target mapping
| Today | Mastra |
|---|---|
| `ChatModelProvider` (OpenRouter fetch) | Model router `openrouter/<model>`. A transitional `MastraChatModelProvider` implements the existing interface. |
| Portir triage | Guardrail before the agent (input processor or structured call). It rejects non-legal requests and no longer routes. |
| Answering | Main agent `legalAssistant` (`agent.stream`). `text-delta` maps to `message.delta`. |
| Brief extraction + grounding + drafting | Workflow `lawsuitDraftingWorkflow`, exposed as the tool `draft_lawsuit`. |
| Draft revision | Tool `revise_draft(draftId, instruction)`, which creates a new `DraftResult` with `previousDraftId`. |
| Title generation | Small structured `generate` call. It stays fire-and-forget. |
| Matter link (apply brief, tasks) | `requireApproval` tools (`link_case`, `create_tasks_from_brief`, `create_deadline`) using the pending-action flow. |
| Read context | Tools `search_legal_sources`, `get_case`, `get_draft`, `list_conversation_drafts`, `get_attachment_text`. |

### Decisions
1. **State ownership.** Prisma tables (`ChatMessage` and related) are the source of truth. A Context Builder builds the history (recent messages, a summary of older ones, the linked case, and the drafts in the conversation) and passes it to the agent. Mastra `Memory` is not used for message history. Mastra storage (`@mastra/pg` `PostgresStore`) lives in a separate `mastra` Postgres schema and holds only workflow and approval snapshots and traces.
2. **Durability.** BullMQ stays. One `agent-turn` job runs one turn, and resuming after an approval enqueues an `agent-resume` job.
3. **Runs.** We reuse `WorkflowJob` as the run record (`workflowName = "agent-turn"`), adding the status `WAITING_CONFIRMATION` and token and timing fields. New tables: `AgentToolCall` and `PendingAction`. `DraftResult` is the versioned artifact.
4. **RAG.** `@law/knowledge` and `LegalKnowledgeService` stay. Mastra `PgVector` is not adopted.
5. **Invariants kept.** Everything is scoped by `workspaceId`; stored and prompted text is in Latin script; AI stays optional for core workflows; business services never import Mastra; tools are thin adapters with zod schemas and a declared side-effect level.

### Non-goals
- A second chat UI. Router plus specialist agents. Implementing `evaluation` or `review` as part of this epic.

## Acceptance (epic)
- With `ASSISTANT_ENGINE=mastra`, a follow-up question uses the earlier turns. The agent can call read-only tools, draft and revise a lawsuit, and propose writes that execute only after the user confirms.
- Every run records the model, tokens, duration and tool calls.
- The legacy engine keeps working until the cleanup phase.
