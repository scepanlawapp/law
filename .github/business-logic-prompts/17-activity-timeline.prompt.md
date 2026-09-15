# Phase 17 — Activity events and timeline

## Context to add manually

Attach/reference changes from Client API, Matter API, Document backend, and current event/audit infrastructure if any.

## Read before planning

- `docs/legal-domain/11-activity-audit.md`
- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement meaningful backend-generated activity events and Client/Matter timeline UI.

## Mandatory Plan-mode protocol

You are working in **Plan mode first**.

Before proposing implementation details:

1. Read the repository-wide instructions in `.github/copilot-instructions.md`.
2. Read the specification files listed above.
3. Read the prior delivery artifacts referenced in `Context to add manually`.
4. Inspect the relevant repository code, migrations, tests, configuration, API conventions, and UI components.
5. Prefer repository facts over assumptions.
6. Ask me for any information that is genuinely needed and cannot be reliably determined from the repository.
7. If no blocking information is needed, explicitly write: `No blocking questions.`
8. Produce a concrete plan before modifying application code.

Your plan must include:

- repository findings relevant to this phase;
- exact scope and non-scope;
- expected files/modules to change;
- database/migration impact;
- API/contract impact;
- frontend impact when applicable;
- compatibility and data-safety risks;
- test/verification strategy;
- any decisions that require my approval.

Do not modify application code while the plan is awaiting approval.

## Delivery tracking — mandatory

This phase owns:

```text
delivery/17-activity-timeline/
```

Maintain:

```text
plan.md
changes.md
decisions.md
verification.md
open-questions.md
```

If Plan mode cannot write repository files, include the exact proposed content for `plan.md` in your plan response and create/update the delivery files immediately when execution begins.

During implementation:

- keep `changes.md` synchronized with actual changes;
- record durable decisions and deviations in `decisions.md`;
- record exact checks actually run in `verification.md`;
- put unresolved or deferred items in `open-questions.md`;
- write `None.` when there are no open questions.

Never claim that a check passed if you did not run it.

## Tasks

1. Reuse an existing domain-event/audit mechanism if it fits the required semantics.
2. Implement ActivityEvent storage or repository-equivalent model when needed.
3. Record the minimum initial events defined in the specification for Client, Matter, MatterClient, Participant, Proceeding, and Document actions.
4. Ensure event creation is reliable relative to the business transaction.
5. Keep payloads minimal and avoid unnecessary sensitive snapshots.
6. Implement Client activity and Matter activity API/query behavior.
7. Implement chronological timeline UI with human-readable events.
8. Add tests proving events are created for important actions and remain tenant scoped.

## Constraints

- Reuse the existing stack and conventions unless there is a documented reason not to.
- Preserve tenant isolation and authorization.
- Preserve existing data.
- Avoid destructive migrations.
- Do not invent placeholder business data.
- Do not refactor unrelated modules.
- Add/update tests for important rules introduced in this phase.
- Stop and ask if a newly discovered issue would materially change the approved product behavior.

## Completion gate

Phase is complete when the timeline accurately reflects real backend business actions and is not fabricated by the frontend.

At the end, summarize the phase and point me to all files under `delivery/17-activity-timeline/`.
