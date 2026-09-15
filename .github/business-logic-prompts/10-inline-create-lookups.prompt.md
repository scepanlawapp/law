# Phase 10 — Reusable inline-create lookup UX

## Context to add manually

Attach/reference `delivery/07-lookup-api/changes.md`, `delivery/08-client-form-ui/changes.md`, and `delivery/09-matter-form-ui/changes.md`.

## Read before planning

- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Create a reusable, non-overengineered inline-create behavior for configurable lookup selects.

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
delivery/10-inline-create-lookups/
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

1. Identify the existing searchable select/combobox and modal/popover/drawer patterns.
2. Implement a reusable inline-create pattern for PracticeArea, MatterStage, ParticipantRole, ProceedingType, DocumentCategory, and OrganizationRelationshipType where relevant.
3. Show an action such as `+ Add "<entered text>"` only when appropriate.
4. After create, close the creation surface, refresh/invalidate the lookup cache, and select the new value.
5. Handle duplicate/validation/API errors clearly.
6. Respect permissions if not every user can create lookup values.
7. Avoid a giant generic abstraction if the existing component model favors a small shared hook/helper.
8. Add component/integration tests appropriate to the repository.

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

Phase is complete when configurable lookup creation is consistent and reusable across forms.

At the end, summarize the phase and point me to all files under `delivery/10-inline-create-lookups/`.
