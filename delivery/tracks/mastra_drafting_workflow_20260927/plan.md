# Mastra Drafting Workflow — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] `@law/mastra`: `lawsuitDraftingWorkflow` and `draftRevisionWorkflow` with a typed drafting request context. Add specs (scripted provider and search).
- [x] `@law/mastra`: tools `draft_lawsuit`, `revise_draft`, `get_draft`, `list_conversation_drafts`, extended tool deps and request context (turn scope, intent, workspace state), and prompt updates. Add specs.
- [x] Chat: `AssistantDraftingService` (conversation inputs, attachment reuse and extraction, child jobs and events, brief and draft persistence, revision, read models), wired into `AssistantToolsAdapter`. Add a spec.
- [x] Chat: context builder workspace-state block, `AgentTurnRunner` DRAFT_READY outcome and turn scope, and triage routing DRAFT → `agent-turn` in the mastra engine. Add specs.
- [x] Web: labels for the new tools (eng/ser).
- [x] Verify: tests, builds, lint, and a live end-to-end run (draft from conversation → brief and draft rows → revise from chat → new version).
- [x] Docs: `bussiness-logic-done-so-far.md`, `AI_ARCHITECTURE.md`, epic plan.

## Findings

- **UI contract.** `BriefExtractionResult.jobId` and `DraftResult.jobId` are unique FKs, and the web UI keys on `brief-extraction` / `drafting` jobs (Case-work pane, draft activity). So the draft tools create those child jobs under the turn's correlation id instead of storing results on the `agent-turn` job. Their inputs have the legacy shape, so retry still works through the legacy runner.
- **Secrets.** Workflow dependencies (model provider, search, hooks) are bound by closure, not placed on `RequestContext`, so provider credentials never enter Mastra run state. A check of the phase-3 traces found no API key in `mastra_ai_spans`. The spans do contain prompts and answers (client data), so `.env.example` now warns that `MASTRA_TRACING` stores them.
- **`bail()`** ends `lawsuit-drafting` after the brief for non-lawsuit requests (`UNSUPPORTED`). The brief is still persisted and shown.
- **Attachments.** Text that is already extracted is reused. Pending attachments from earlier turns are extracted when drafting starts. In the end-to-end run, the attachment sent with turn 1's question was extracted in turn 2.
- **Outcome.** A turn that produced a draft stores `metadata.outcome = "DRAFT_READY"` and `draftId`. As with legacy draft messages, the message API does not expose `draftId`; the UI opens the latest draft.
- **Wording.** In the first end-to-end run the agent showed raw draft ids and `READY_FOR_SIGNOFF` to the user. The prompt now asks for versions and plain-language status. This change is covered by a unit test but was not re-run live.
- **Shell.** `pkill -f "<cmd>"` in the same shell line matches that shell's own command line, which caused the earlier exit-144 results. Stop background servers with a separate command.

## Verification results

- **Unit tests:**
  - `nx test mastra`: 27 tests. New ones cover the drafting workflows (full, UNSUPPORTED, revision feedback, grounding failure, model failure), the draft tools passing the turn scope, the prompt hints, and an agent loop that calls `draft_lawsuit`.
  - `nx test api`: 142 tests. New ones: the `assistant-drafting.service` spec (8 tests: conversation facts and attachments, child jobs and event order, NO_CONTEXT, UNSUPPORTED, FAILED marking the job, revision creating a linked v2, list and workspace state, read), agent-turn `DRAFT_READY`, DRAFT routed to `agent-turn`, and workspace state in the context.
  - `nx test web` (assistant): 34 tests.
- **Build and lint.** `nx build api` and `nx build web` pass. Lint passes for mastra, api, contracts, api-interfaces and triage. `nx lint web` still shows the same 11 existing problems.
- **Live end-to-end run.** Built API on port 3111 with `ASSISTANT_ENGINE=mastra LLM_BACKEND=mastra`, `gemini-3.8-flash`, session linked to case 2026-21, soft-deleted afterwards.
  1. Facts plus `platni-listic.txt` attachment and a question: `agent-turn`, 3 legal searches, answer with citations.
  2. "Pripremi tužbu za isplatu te zarade." ran `triage` → `agent-turn`. Inside it, `draft_lawsuit` (38 s) created `brief-extraction` and `drafting` jobs.
     - The brief came from turn 1: plaintiff Petar Petrović with address, defendant Alfa d.o.o., claim 150.000 RSD, and the attachment listed as evidence.
     - The attachment went from pending to extracted (137 characters).
     - A draft was saved with 1 citation, and the message outcome was `DRAFT_READY`. The agent listed the missing court, defendant address and IDs.
  3. "Skrati obrazloženje … dodaj zahtev za naknadu troškova postupka." ran `revise_draft` (14 s), which created a new `drafting` job and draft v2 with `previousDraftId` pointing to v1. Both drafts are `READY_FOR_SIGNOFF`.
  4. "Koje verzije nacrta imamo?" ran `list_conversation_drafts`, which returned 2 results, and the agent described v1 and v2.
  - The API log had no warnings or errors.
