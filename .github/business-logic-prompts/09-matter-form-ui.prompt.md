# Phase 09 — Matter create and edit frontend

## Context to add manually

Attach/reference `delivery/06-matter-api/changes.md`, `delivery/07-lookup-api/changes.md`, and existing Matter/Case form files.

## Read before planning

- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement the Matter create/edit UX with correct control types and Draft/Open behavior.

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
delivery/09-matter-form-ui/
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

1. Implement Title as text input.
2. Implement Clients as multi-autocomplete with a clear primary Client behavior if approved.
3. Provide 'Create new client' from Client selection using the smallest reusable workflow that fits the current UI.
4. Implement PracticeArea and Stage as searchable selects.
5. Implement Priority using an existing suitable enum control.
6. Implement Responsible user as autocomplete.
7. Implement Opened date as date picker and Description as textarea.
8. Add Participant and Proceeding sections with add/edit/remove UX appropriate to the current screen architecture.
9. Implement Save Draft and Open Matter actions with backend-authoritative transition validation.
10. Add loading, error, validation, and frontend tests.

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

Phase is complete when a user can create a Draft or Open Matter with multiple Clients and optional participants/Proceedings using the new API.

At the end, summarize the phase and point me to all files under `delivery/09-matter-form-ui/`.
