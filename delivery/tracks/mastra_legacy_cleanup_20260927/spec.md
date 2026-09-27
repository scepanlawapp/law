# Mastra Legacy Cleanup — Specification

## Why

Phases 1–6 rebuilt the assistant on Mastra behind flags, and every capability is verified on the new path. Two implementations of answering, drafting and model access now coexist: the legacy `WorkflowRunner` chain with its own OpenRouter `fetch` client, and the agent with its workflows. AI_ARCHITECTURE §10 step 9 says to remove the old code once the replacement is verified. Keeping both doubles maintenance and lets the paths drift apart.

## What

1. **Single engine.**
   - Portir triage is a guardrail only, and always gets the recent conversation and the practice-management rule. NON_LEGAL and UNCLEAR messages get the same short replies as before.
   - Every LEGAL message becomes an `agent-turn`, with the intent as a hint.
   - `ASSISTANT_ENGINE` is removed.
2. **Thin `WorkflowRunner`.** It dispatches only:
   - `triage`,
   - `agent-turn` / `agent-resume` → `AgentTurnRunner`,
   - historical `answering` jobs (retry, regenerate, or still queued in Redis at deploy) → run as an agent turn, with the triggering message resolved from the job's correlation id,
   - `brief-extraction` and `drafting` jobs (retries, and "request changes" from the draft review panel) → `AssistantDraftingService`, which runs the Mastra drafting workflows on the existing job row with the same persistence and events. Review-panel revisions still end with the "Nacrt je spreman za pregled." message.
3. **Removed code:**
   - The legacy answering, brief-extraction and drafting implementations in `WorkflowRunner` (answer prompt, grounding, attachment extraction, case context, persistence).
   - `OpenRouterChatModelProvider` and `LLM_BACKEND`. `ChatModelProvider` stays as the interface for structured calls (triage, titles, drafting workflows, summaries) and is implemented by `MastraChatModelProvider`.
   - The placeholder libs `@law/evaluation`, `@law/review`, `@law/ollama` and `@law/n8n`, plus the `evaluation`/`review` workflow names. A local model (for example Ollama) can later be configured through Mastra's OpenAI-compatible model config.
4. **Tests and docs.** Legacy-chain tests whose behavior now lives in the agent, drafting and runner specs are removed or replaced. AGENTS.md, the business-logic doc, AI_ARCHITECTURE and `.env.example` describe the single engine.

## Non-goals

- Changing agent behavior, prompts, the data model or the UI.
- Removing the `answering` workflow name. Historical rows still exist and still render in the UI.

## Acceptance

- No code path or configuration selects a legacy engine. The API builds, and all affected test projects pass.
- Retrying a failed drafting job and "request changes" in the review panel both produce a new draft version through the Mastra workflow.
- A live chat still answers, drafts and revises.
