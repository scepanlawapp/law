# Mastra Confirmations — Plan

- [x] Create this track and link it from `delivery/index.md`.
- [x] Prisma: `PendingAction`, `PendingActionStatus`, `WAITING_CONFIRMATION`, relations, and a migration generated offline and applied with `migrate deploy`.
- [x] Contracts: `PendingActionSummary`, `confirmation.required`/`confirmation.updated`, `ChatSessionDetail.pendingActions`, `WAITING_CONFIRMATION`, and `agent-resume`.
- [x] `@law/mastra`: tools `link_case`, `create_deadline`, `create_tasks_from_brief` (propose only), `ASSISTANT_TOOL_SIDE_EFFECTS`, prompt rules, tool labels. Add specs.
- [x] Chat: `AssistantActionsService` (propose/validate/normalize, idempotency, events; decide with atomic claim, execution through existing services, AI_ASSISTED logs, job completion, resume enqueue). Add a spec.
- [x] Chat: runner marks `WAITING_CONFIRMATION`, resume mode (`agent-resume`), controller endpoints and DTO, session detail, regenerate guard. Add specs.
- [x] Web: api-client methods, pending-action card component, assistant wiring, waiting activity status, i18n. Add specs.
- [x] Verify: tests, builds, lint, and a live end-to-end run (propose → nothing written → approve → deadline and activity log → resume; decline; double approve).
- [x] Docs: `bussiness-logic-done-so-far.md`, `AI_ARCHITECTURE.md`, AGENTS.md, epic plan.

## Findings

- **Guardrail gap.** In the first live run, Portir classified "Postavi rok za podnošenje odgovora na tužbu …" as UNCLEAR, because its prompt only accepts legal questions and drafting. The agent engine now adds `PORTIR_PRACTICE_RULE`: looking up or linking cases, deadlines and tasks count as LEGAL/ANSWER. Legacy triage is unchanged.
- **Atomic claim.** Two concurrent approvals execute once. The second request returns the in-flight `EXECUTING` state, and the final `APPROVED` state arrives through `confirmation.updated`.
- **Run state.** A proposing turn ends `WAITING_CONFIRMATION`. After the last decision it becomes `COMPLETED` and an `agent-resume` job (same correlation id) continues. The resumed agent reads the conversation up to now plus a synthetic `[Potvrda] …` turn that lists each decision and its result. The decision is stored only in our tables.
- **Actor.** The approve endpoint runs in the HTTP workspace context, so `createDeadline` records the approving lawyer as `createdByUserId` and as the activity actor. The log row is then tagged `{ source: "AI_ASSISTED", pendingActionId }`.
- **Message API.** It now exposes `pendingActionIds`, so cards render under the proposing message only, not under the resume message that shares the correlation.
- **Wording.** Serbian dates already end with ".", so the result message no longer adds another (seen live as "15.10.2026..").

## Verification results

- **Unit tests:**
  - `nx test mastra`: 29 tests (the proposal tools pass the turn scope, and every agent tool declares a side-effect level).
  - `nx test triage`: 9 tests (the practice rule applies only when requested).
  - `nx test api`: 161 tests. New ones: the `assistant-actions.service` spec (15 tests: normalized proposal with no writes, idempotency, past and invalid dates, missing and ambiguous case, already-linked case, brief must be applied, only open tasks proposed, concurrent approvals execute once with AI_ASSISTED tag and resume, decline with reason, failed execution, expiry, resume only after the last decision, workspace isolation), runner `WAITING_CONFIRMATION` and resume note, controller decide endpoints, and the regenerate guard.
  - `nx test web` (assistant): 39 tests (card rendering, emitted events, busy state, outcome and error display; waiting and resumed activity).
- **Build and lint.** `nx build api` and `nx build web` pass. Lint passes for mastra, api, contracts, api-interfaces and triage.
  - `api-clients` lint shows 1 dependency-checks error (missing `@angular/core`, `@angular/common`, `rxjs` in its package.json). The same error appears on the base branch.
  - `nx lint web` still shows the same 11 existing problems.
- **Migration.** `20260927200000_assistant_pending_actions` was generated offline and applied locally with `prisma migrate deploy`.
- **Live end-to-end run.** Built API with `ASSISTANT_ENGINE=mastra LLM_BACKEND=mastra`, `gemini-3.8-flash`, session linked to case 2026-21.
  1. "Postavi rok za podnošenje odgovora na tužbu za 15. oktobar 2026." ran `triage` → `agent-turn:WAITING_CONFIRMATION`. `create_deadline` produced the card "Novi rok: Podnošenje odgovora na tužbu — 15.10.2026." with case, type "sudski", responsible lawyer and description. The message carried `pendingActionIds`, and SSE sent `confirmation.required`.
  2. Two concurrent approve calls returned `EXECUTING` and `APPROVED`. Exactly one deadline was created (2026-10-15, COURT), after the decision time, with the approver as creator and an `AI_ASSISTED` activity log row. The run moved to `agent-turn:COMPLETED` and `agent-resume:COMPLETED`, and the agent confirmed the deadline.
  3. "Poveži ovaj razgovor sa predmetom 2026-20." produced a `link_case` card. Declining it with a reason wrote nothing: the session stayed on 2026-21 and there is no `CHAT_SESSION_LINKED` log. The agent acknowledged the decline.
  - The API log had no warnings or errors.
  - Cleanup: the test deadline and its activity row were deleted by id. The test sessions were soft-deleted.
- **Not verified.** The confirmation card in a real browser. It is covered by component specs and the production build only.
