# Mastra Legacy Cleanup — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] `AssistantDraftingService`: `runBriefJob(job)` and `runDraftingJob(job)` on existing job rows (a shared core with `draftLawsuit`/`reviseDraft`). Add specs.
- [x] `WorkflowRunner`: guardrail-only triage → `agent-turn`, `answering` adapted to an agent turn, `brief-extraction`/`drafting` delegated, and the legacy code removed. Rewrite the runner specs.
- [x] Triage: `runPortirGraph` returns `accepted` instead of routing flags. Update the specs.
- [x] Remove `OpenRouterChatModelProvider`, `LLM_BACKEND` and `ASSISTANT_ENGINE` (config, env, resolver, specs).
- [x] Remove the `evaluation`/`review`/`ollama`/`n8n` libs, path aliases, and the workflow names `evaluation`/`review` (contracts, i18n).
- [x] Remove or replace the legacy-chain tests in `chat.service.spec`.
- [x] Verify: tests (api, mastra, triage, llm, contracts, web assistant), builds, lint, and a live end-to-end run (answer, draft, review-panel request-changes → new version through Mastra, retry).
- [x] Docs: AGENTS.md, `bussiness-logic-done-so-far.md`, AI_ARCHITECTURE (cleanup done), `.env.example`, epic plan and metadata (epic completed).

## Findings

- The legacy chain tests in `chat.service.spec` were deleted rather than ported. Each behavior already has an agent-path spec (`agent-turn.runner.spec`, `assistant-drafting.service.spec`, `workflow.runner.spec`). One replacement test checks that `sendMessage` runs Portir and queues exactly one `agent-turn`.
- `WorkflowRunner` must hand the drafting service the row returned by the RUNNING transition, not the queued record. The runner spec caught this.
- Old `answering` jobs have no `messageId` in their input, so the runner resolves the USER message by `correlationId`.
- `infra/n8n` exports and the commented Compose services stay as infrastructure notes. Only the unused code libraries were removed.

## Verification

- `nx test api`: 27 suites, 163 tests. `nx test` for mastra, triage, llm, contracts and api-interfaces passes. The web assistant specs pass: 16 suites, 83 tests.
- `nx lint` passes for api, mastra, triage, llm, contracts and api-interfaces. `nx build api` and `nx build web` pass.
- Live run against the built API on :3111 with no engine flags (OpenRouter):
  - A non-legal message gets the Portir reply and triage only.
  - A legal question runs `triage` → `agent-turn` with 3 `search_legal_sources` calls and a cited answer.
  - "Pripremi tužbu" runs `agent-turn` → `brief-extraction` → `drafting`, producing draft v1.
  - Review-panel request-changes queues a `drafting` job. It creates v2 (`previousDraftId` = v1) and the message "Nacrt je spreman za pregled.".
  - Retrying that job after it was forced to FAILED creates a new version.
  - The server log has no errors and no key material. The test session was soft-deleted.
