# Mastra Drafting Workflow — Specification

## Why

Drafting is a fixed chain started only by Portir's DRAFT intent, and it reads only the current message. A draft can be changed only through "request changes" in the review panel. The agent from phase 2 cannot draft, read, or revise drafts. So "napravi tužbu na osnovu ovoga što smo pričali", followed by "skrati obrazloženje", is impossible. AI_ARCHITECTURE §4 asks for known processes to run as workflows exposed to the agent as tools, and §3 asks for documents to be versioned entities that the agent sees in its context.

## What

Everything is behind `ASSISTANT_ENGINE=mastra`. The legacy engine is unchanged.

1. **Mastra workflows** in `@law/mastra`, reusing the existing prompts, schemas, context builders and grounding helpers:
   - `lawsuitDraftingWorkflow`: `extract-brief` (brief prompt + `BriefResult`) → `ground-and-draft` (grounding queries → pgvector citations → lawsuit draft with used citations). Non-lawsuit briefs end with `UNSUPPORTED`.
   - `draftRevisionWorkflow`: `ground-and-draft` with the previous draft text and the revision instruction as feedback.
   - Per-run dependencies (model provider, legal search, progress and brief hooks) come through a typed `RequestContext`, so the workflows stay static and registrable.
2. **Agent tools.** All are thin adapters. Draft writes are reversible (new versions awaiting lawyer approval), so they run without confirmation.
   - `draft_lawsuit(note?)`: drafts from the conversation's client messages and the session's attachments.
   - `revise_draft(instruction, draftId?)`: creates a new version (`previousDraftId`) of the latest or a named draft.
   - `get_draft(draftId?)`: returns the text (truncated), status, warnings and citations. Read-only.
   - `list_conversation_drafts()`: the session's drafts. Read-only.
3. **Persistence and UI contract** (`AssistantDraftingService`, Nest):
   - Each draft or revision creates the same child `WorkflowJob` rows as the legacy chain (`brief-extraction`, `drafting`) under the turn's correlation id. `BriefExtractionResult`, `DraftResult` and `DraftCitation` keep their unique job FKs.
   - The job inputs have the legacy shape, so retry still works.
   - The UI's Case-work pane (brief), Draft pane (`draft.updated`) and activity steps work unchanged.
   - Attachments that were already extracted are reused and not extracted again.
4. **Agent turn.**
   - In the mastra engine, Portir routes both ANSWER and DRAFT intents to `agent-turn`. The intent is passed to the agent as a hint.
   - The context builder adds a workspace-state block listing the conversation's drafts (id, version, status, first line).
   - A turn that produced a draft ends with `outcome: "DRAFT_READY"` and `draftId`, so the UI shows "Otvori nacrt". It cannot be regenerated, which would create another draft.
5. **Tool activity:** labels and i18n for the new tools.

## Non-goals

- "Request changes" from the review panel keeps using the legacy drafting job.
- Confirmations and write tools on cases, tasks and deadlines (phase 5).
- Drafting document types other than lawsuits.

## Acceptance

- In the mastra engine, "Pripremi tužbu …" produces a brief (Case-work pane) and a draft (Draft pane) from the conversation. The agent summarizes missing fields.
- A follow-up "skrati obrazloženje" creates a new draft version linked to the previous one, and the chat shows it.
- The legacy engine and the draft approval gate behave exactly as before.
