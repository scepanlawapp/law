# Phase 16 — Dynamic custom fields frontend

## Context to add manually

Attach/reference `delivery/15-custom-fields-backend/changes.md`, current form component patterns, and the Matter/Client form changes from Phases 08–09.

## Read before planning

- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement a reusable custom-field renderer and integrate it into the first approved forms.

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
delivery/16-custom-fields-frontend/
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

1. Fetch field definitions according to entity type and PracticeArea when applicable.
2. Render TEXT, TEXTAREA, INTEGER, DECIMAL, MONEY, DATE, DATETIME, BOOLEAN, SINGLE_SELECT, MULTI_SELECT, PARTY_REFERENCE, CLIENT_REFERENCE, and USER_REFERENCE using existing controls.
3. Apply definition ordering and required state.
4. Preserve/display inactive historical options when editing existing records while preventing inappropriate new selection.
5. Integrate first with Matter create/edit unless the approved plan chooses Client first for repository reasons.
6. Keep backend validation authoritative and map validation errors back to fields.
7. Add component/integration tests for representative data types and PracticeArea-driven definitions.

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

Phase is complete when new office-specific fields can be rendered from metadata without hard-coded per-field components.

At the end, summarize the phase and point me to all files under `delivery/16-custom-fields-frontend/`.
