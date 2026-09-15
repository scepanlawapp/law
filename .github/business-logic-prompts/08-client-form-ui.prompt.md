# Phase 08 — Client create and edit frontend

## Context to add manually

Attach/reference `delivery/05-client-api/changes.md`, `delivery/07-lookup-api/changes.md`, and existing Client form/component files.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Replace the early Client form with the Party/Client model while preserving the existing design system and frontend architecture.

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
delivery/08-client-form-ui/
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

1. Implement Person vs Organization with segmented control/radio.
2. For Person require First name and Last name.
3. For Organization require Legal name and support optional Trade name.
4. Implement repeatable contact details using the new API contract.
5. Implement identifier and address sections with progressive disclosure appropriate to the existing design system.
6. For organizations, implement Contact persons with 'link existing person' autocomplete and 'create new person'.
7. Support relationship type, job title, department, and primary contact.
8. Add loading, validation, submit, and API error states using existing patterns.
9. Do not duplicate backend business validation unnecessarily.
10. Update frontend tests.

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

Phase is complete when both Person and Organization Client workflows work against the new API, including multiple organization contact persons.

At the end, summarize the phase and point me to all files under `delivery/08-client-form-ui/`.
