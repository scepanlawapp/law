# Assistant Live Workflow Experience Specification

## Context

The `/assistant` route currently feels inactive after Portir accepts a legal request. The API has an SSE endpoint and emits some triage, job, message, and draft events, but the browser only renders a global classification indicator and assistant messages.

The main gaps are behavioral rather than purely visual:

- `WorkflowRunner` persists `RUNNING` but does not emit that transition.
- The Angular assistant ignores `job.updated` and `draft.updated`.
- A successful drafting workflow persists a draft without emitting it or creating a final "ready for review" message.
- The current replay logic reconstructs only messages and newly created jobs, labels persisted jobs as queued, filters by `createdAt`, and omits drafts and later transitions.
- The event bus is in-memory, so durable database state must remain authoritative.
- The current model provider supports structured completions only; token streaming requires a separate provider capability and user-facing answering workflow.

## Goals

- Keep users informed from message submission to a terminal answer, clarification, failure, or draft ready state.
- Present one live activity block for each user turn and update it in place.
- Support overlapping workflows in one conversation through `correlationId`.
- Recover workflow activity, partial responses, and drafts after refresh or SSE interruption.
- Stream conversational legal guidance token by token while keeping internal structured outputs validated and private.
- Post explicit terminal assistant messages for every branch, including unsupported draft requests and failures.
- Surface background-conversation progress and completion.
- Preserve the existing draft review, upload, speech, session, approval, export, theme, and responsive behavior.

## Non-goals

- Stop or cancellation controls.
- Token-streaming draft documents or exposing partial structured JSON.
- Verified statute or case-law retrieval, Qdrant, template retrieval, or citation verification.
- New drafted document types beyond the currently supported lawsuit flow.
- Redis pub/sub SSE fan-out for separately deployed API and worker processes.
- Persistent cross-device unread state.
- Replacing the current assistant workspace layout or draft approval state machine.

## User experience

### Active activity

Each user turn owns a correlated activity block directly after that turn. It shows:

- A friendly current action as the main label.
- The responsible agent as secondary detail.
- An animated running state and total elapsed time, such as `Working for 18s`.
- Expandable stages relevant to the route:
  - Understanding request.
  - Reading attachments.
  - Extracting facts.
  - Preparing draft.
  - Saving for review.

Stages not used by a route are omitted. Screen-reader announcements occur only when the meaningful stage changes.

### Completed activity

Completed activity remains in history as a collapsed, outcome-focused row such as `Answer completed` or `Draft prepared`. Expanding it reveals stage outcomes. Failed activity remains expanded and offers Retry.

### Conversational answers

Portir routes ordinary legal questions to an `answering` workflow. The assistant response:

- Streams progressively in the language of the user's message.
- Supports sanitized Markdown headings, paragraphs, lists, emphasis, and links.
- Clearly states that it is general, unverified guidance when legal precision matters.
- Does not invent article numbers, source links, or citations.
- Offers Copy, Regenerate, and positive/negative feedback after completion.

### Draft preparation

Supported lawsuit requests continue through brief extraction and drafting. On success:

- The draft is emitted after it has been persisted and validated.
- A final assistant message announces that the draft is ready for review.
- Desktop opens the existing review pane automatically.
- Mobile provides an explicit Open draft action.

Contract, other, empty, or insufficient draft requests end with a clear explanation or clarifying question instead of silent completion.

### Concurrent and background work

The composer becomes available after message submission even while earlier workflows run. Every turn is merged independently by `correlationId`.

If the user changes conversations, work continues. The conversation list shows running or ready state, and a localized toast announces a completed background answer or draft.

## Functional requirements

### Contracts and snapshots

- Shared contracts represent intent route (`ANSWER` or `DRAFT`), output language (`sr` or `en`), workflow stage, richer job status, message streaming events, feedback, and workspace event identity.
- `ChatSessionDetail` includes the persisted jobs and drafts needed to reconstruct correlated activity.
- Session summaries expose enough active workflow state for background indicators.
- `WorkflowJob` rows and persisted messages are authoritative; event delivery is an optimization.
- Existing `WorkflowJob.input`, `output`, `createdAt`, `updatedAt`, and `correlationId` are reused. No dedicated activity-event table is required.

### Workflow lifecycle

- Every queued, running, stage, completed, and failed transition is persisted before it is emitted.
- The emitted job payload reflects the persisted row, including `updatedAt`, `errorCode`, and current stage.
- Structured LLM or schema failures are terminal failed states with a user-safe error.
- Unexpected infrastructure failures continue to use BullMQ retry behavior.
- Attachment extraction exposes reading status and per-file failure without leaking extracted content into UI events.

### Streaming

- `ChatModelProvider` retains structured completion and adds text streaming.
- OpenRouter SSE chunks are parsed server-side.
- A pending assistant message is persisted before the first token.
- Token deltas are transient SSE events; accumulated content is checkpointed periodically.
- Completion persists the full message before emitting the terminal update.
- Failure retains checkpointed partial content and marks the message failed.

### Reconnect and event scope

- The frontend subscribes to an authenticated workspace event stream.
- Events contain workspace, session, correlation, and creation identity where applicable.
- Selected-session events update the transcript; other-session events update navigation and notifications.
- Initial load and reconnect refresh authoritative snapshots and merge idempotently by IDs and correlation.
- The design remains compatible with a future Redis event adapter, but distributed fan-out is not part of this track.

### User actions

- Retry re-runs a terminal failed stage from persisted input without duplicating the user message.
- Retry is rejected while a correlated job is active.
- Regenerate creates a new answering attempt for an eligible completed streamed response.
- Feedback supports positive, negative, and cleared values on assistant messages and is stored in message metadata.

## Safety and legal accuracy

- User-facing legal answers are general guidance, not verified legal research.
- Prompts explicitly forbid fabricated citations, article numbers, and source links.
- Provision-specific certainty requires a source supplied by the user or a future verified retrieval system.
- Structured internal job input/output is never streamed to the browser.
- Workspace and tenant isolation applies to snapshots, streams, retry, regeneration, feedback, attachments, and drafts.

## Accessibility and visual requirements

- Use the existing assistant visual language, Spartan/UI controls, Lucide icons, and semantic tokens.
- Active state, completion, and failure are not conveyed by color alone.
- Activity expansion, Retry, Open draft, Regenerate, Copy, and feedback are keyboard accessible and accurately named.
- `aria-live` output is concise and does not announce elapsed-time ticks.
- Completed summaries, stage labels, errors, reconnect states, tooltips, and toasts are localized in Serbian and English.
- Long labels and streamed content do not resize or overlap the transcript, composer, sidebar, or draft pane.

## Acceptance criteria

- A legal drafting request visibly progresses through every applicable stage and ends with a persisted draft-ready message.
- An ordinary legal question streams a persisted assistant response and ends with `Answer completed`.
- Refreshing or reconnecting during queued, running, partial, completed, or failed work reconstructs the correct state.
- Two turns can run concurrently without stages or token deltas crossing correlations.
- Switching conversations preserves work and surfaces background completion in navigation and a toast.
- Failed work exposes Retry without duplicating the user turn; completed answers support Regenerate, Copy, and feedback.
- Unsupported or insufficient draft requests always receive a clear terminal response.
- The draft opens automatically on desktop and through a deliberate action on mobile.
- No unverified citation is presented as authoritative.
- Focused API and web tests, full project tests, lint, and development builds pass, apart from explicitly documented unrelated failures.
