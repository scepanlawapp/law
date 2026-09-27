# Mastra Confirmations — Specification

## Why

After phase 4 the agent can research and draft, but it cannot act on the practice records around a matter. It cannot link the conversation to a case, set a deadline, or turn a brief's missing facts into tasks. AI_ARCHITECTURE §5 requires such writes to create a pending action, put the run into `waiting_confirmation`, and execute only after the user approves, with an idempotency key and authorization checked in code rather than in the prompt.

## Decision: our pending-action flow, not Mastra tool suspension

Mastra's `requireApproval` / `approveToolCall` resumes a suspended agent run from a Mastra storage snapshot. We do not use it here, for three reasons:

1. The snapshot would persist the conversation and run state in the `mastra` schema. That contradicts §6: our tables are the only message store.
2. Approvals can arrive hours later, after a deploy or restart, from any API instance. The approving lawyer must be the actor of the change.
3. Execution should be deterministic service code, not a model step.

Instead:

- The tool validates and normalizes the request and stores a `PendingAction`.
- Approval executes it through the existing services. The approving user is the actor, and the activity log records `metadata.source = "AI_ASSISTED"`.
- An `agent-resume` job then lets the agent continue with the outcome.

This matches the AI_ARCHITECTURE pattern and "use Mastra suspend/resume where it fits". It does not fit here.

## What

Everything is behind `ASSISTANT_ENGINE=mastra`.

1. **Data.**
   - New `PendingAction` table: workspace, session, `agent-turn` job, correlation id, action type, normalized payload, human-readable summary and detail lines, status, idempotency key (unique), result, error, expiry (24 h), decision user and time.
   - Statuses: `PENDING` → `EXECUTING` → `APPROVED`/`FAILED`, or `DECLINED`/`EXPIRED`.
   - `WorkflowJobStatus` gains `WAITING_CONFIRMATION`.
2. **Agent tools.** Each declares its side-effect level (`confirm`) and only proposes:
   - `link_case(caseReference)`: link this conversation to a case (by number or name).
   - `create_deadline(title, dueDate, deadlineType?, description?, caseReference?)`: a deadline on the linked or named case. The responsible lawyer is the case's. Past dates are rejected.
   - `create_tasks_from_brief(briefId?)`: tasks from the brief's missing facts and evidence. The brief must already be applied to a case.
3. **Run state.** A turn that proposed actions ends with job status `WAITING_CONFIRMATION`. It becomes `COMPLETED` once all of its actions are decided.
4. **API.**
   - `POST /chat/pending-actions/:id/approve` and `POST /chat/pending-actions/:id/decline`, with CSRF, auth and workspace guards.
   - An atomic `PENDING` → `EXECUTING` claim prevents double execution. Deciding an already-decided action returns its current state.
   - Expired actions are refused.
5. **Events.** `confirmation.required` and `confirmation.updated` carry a `PendingActionSummary`. `ChatSessionDetail.pendingActions` restores the cards after a reload.
6. **Resume.** When the last pending action of a turn is decided, an `agent-resume` job (same correlation id) runs the agent with the conversation plus a note describing the decisions and results. The agent confirms the outcome and continues if needed.
7. **Web.**
   - A confirmation card under the assistant message: summary, details, Approve/Decline, and a spinner while deciding. After the decision it shows the outcome.
   - The activity status "Čeka vašu potvrdu" for waiting runs.
   - i18n for eng and ser.
8. **Guards.** Regenerating a turn that proposed actions is refused, because it would duplicate the proposals.

## Non-goals

- Irreversible external actions (email, payments).
- Editing a proposal before approving it (decline and ask again instead).

## Acceptance

- In the mastra engine, "postavi rok za odgovor na tužbu 15. oktobra" shows a card, and nothing is written.
- Approving creates the deadline with the lawyer as actor and an `AI_ASSISTED` activity log. The agent then confirms.
- Declining writes nothing, and the agent acknowledges.
- Double approval executes once.
