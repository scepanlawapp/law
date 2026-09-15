# Assistant Live Workflow Experience Plan

See [spec.md](./spec.md) for requirements and acceptance criteria.

Status: Completed. Automated validation and authenticated manual browser verification are complete.

## Phase 1 - Contracts and authoritative snapshots

- [x] Extend shared contracts with answer/draft routing, language, progress stages, streaming events, feedback, workspace identity, and richer workflow job fields.
- [x] Add `answering` to the workflow contract.
- [x] Return persisted jobs and drafts with session detail for grouping by `correlationId` in the client state.
- [x] Expose active workflow state in session summaries for background indicators.
- [x] Update mappers and focused snapshot tests.

## Phase 2 - Reliable workflow lifecycle

- [x] Extend Portir structured output to route `ANSWER` versus `DRAFT` and detect `sr` versus `en`.
- [x] Replace accepted-request boilerplate with correlated activity while retaining terminal unclear and non-legal replies.
- [x] Centralize persisted-and-emitted queued, running, stage, completed, and failed transitions.
- [x] Expose attachment reading and fact extraction substages, including per-file failures.
- [x] Emit newly persisted drafts and a final localized draft-ready assistant message.
- [x] Add explicit terminal replies for unsupported, empty, or insufficient draft requests.
- [x] Preserve BullMQ retries for infrastructure failures and make structured LLM failures terminal and eligible for a later user Retry action.

## Phase 3 - Streamed conversational answering

- [x] Add `streamText()` to `ChatModelProvider` without changing structured completion behavior.
- [x] Implement OpenRouter SSE parsing and deterministic fake streaming support.
- [x] Add the `answering` workflow and safety prompt for general, unverified legal guidance.
- [x] Persist a pending assistant message before streaming.
- [x] Emit token deltas, checkpoint accumulated content, and persist completed or failed terminal state.
- [x] Match answer language to the user's message and prohibit fabricated citations.

## Phase 4 - Workspace stream and recovery actions

- [x] Add an authenticated workspace event stream and workspace-filtered event delivery.
- [x] Refresh authoritative selected-session detail and workspace summaries after SSE errors/events.
- [x] Merge snapshots and live events idempotently instead of depending on timestamp replay.
- [x] Add retry for terminal failed jobs without duplicating the user message.
- [x] Add regenerate for eligible streamed answers.
- [x] Add positive, negative, and cleared assistant-message feedback.
- [x] Cover workspace isolation for recovery actions and workspace stream delivery.

## Phase 5 - Angular workflow experience

- [x] Add a pure workflow reducer/store keyed by `correlationId` with out-of-order event handling.
- [x] Render workflow activity using the existing assistant component and semantic tokens.
- [x] Show friendly actions, secondary agent names, applicable stages, and active elapsed time.
- [x] Persist outcome-focused collapsed summaries, expandable persisted job details, and failed-state Retry.
- [x] Remove the global classification send lock and support concurrent turns.
- [x] Assemble streamed token deltas into pending assistant messages.
- [x] Handle live draft events, desktop auto-open, and a dedicated mobile Open draft action.
- [x] Show running/ready conversation indicators and background completion toasts.
- [x] Add sanitized Markdown rendering plus Copy, Regenerate, and persisted feedback controls.
- [x] Add complete Serbian and English localization and concise live-region announcements.

## Phase 6 - Verification

- [x] Test OpenRouter split chunks, malformed data, completion, and failure.
- [x] Test Portir route/language output and persisted/emitted workflow transitions.
- [x] Test streamed answer checkpointing, finalization, failure, regeneration, and retry.
- [x] Test draft-ready events/messages and unsupported draft terminal outcomes.
- [x] Test workspace stream isolation and reconnect reconstruction.
- [x] Test frontend reducer idempotency, overlapping correlations, activity rendering, elapsed state, and actions.
- [x] Test desktop/mobile draft behavior, background session state, localization, accessibility, and Markdown sanitization.
- [x] Run focused Jest checks, full API/web tests, API/web lint, and development builds; document unrelated full-API failures.
- [x] Manually verify `/assistant` with the running authenticated application; the user confirmed the implemented experience works as expected.

## Expected files

- `libs/api/api-interfaces/src/lib/api-interfaces.ts`
- `libs/api/ai/contracts/src/lib/contracts.ts`
- `libs/api/ai/llm/src/lib/llm.ts`
- `libs/api/ai/llm/src/lib/llm.spec.ts`
- `libs/api/ai/workflows/triage/src/lib/triage.ts`
- `libs/api/features/chat/src/lib/workflow.runner.ts`
- `libs/api/features/chat/src/lib/workflow.processor.ts`
- `libs/api/features/chat/src/lib/chat.service.ts`
- `libs/api/features/chat/src/lib/chat.controller.ts`
- `libs/api/features/chat/src/lib/chat.events.ts`
- `libs/api/features/chat/src/lib/chat.mappers.ts`
- `libs/api/features/chat/src/lib/chat.dto.ts`
- `libs/shared/frontend/api-clients/src/lib/api-clients.ts`
- `libs/shared/frontend/api-clients/src/lib/chat-events-url.ts`
- `apps/api/src/app/chat.service.spec.ts`
- `apps/api/src/app/workflow.runner.spec.ts`
- `apps/web/src/app/features/assistant/assistant-workflow-state.ts`
- `apps/web/src/app/features/assistant/assistant.component.ts`
- `apps/web/src/app/features/assistant/assistant.component.html`
- `apps/web/src/app/features/assistant/assistant.component.scss`
- `apps/web/src/app/features/assistant/components/workflow-activity/`
- `apps/web/src/app/features/assistant/components/assistant-message/`
- `apps/web/public/i18n/eng.json`
- `apps/web/public/i18n/ser.json`
- `package.json` and lockfile if a Markdown parser is added.

## Delivery constraints

- Keep database snapshots authoritative and SSE events idempotent.
- Do not expose structured workflow input/output or partial draft JSON.
- Do not add a new activity event table unless implementation evidence disproves reconstruction from existing persisted records.
- Preserve existing public contracts where compatibility is practical.
- Keep application edits scoped to assistant workflow behavior and presentation.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
