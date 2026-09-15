# Phase 15 — Custom fields backend

## Context to add manually

Attach/reference `delivery/02-party-client-foundation/decisions.md`, `delivery/03-matter-proceeding-foundation/decisions.md`, and current database capabilities.

## Read before planning

- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Implement typed, tenant-scoped custom field infrastructure for future office-specific data.

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
delivery/15-custom-fields-backend/
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

1. Implement CustomFieldDefinition, CustomFieldOption, and CustomFieldValue using repository-appropriate storage.
2. Support entity types CLIENT, PARTY, MATTER, PROCEEDING, DOCUMENT.
3. Support data types TEXT, TEXTAREA, INTEGER, DECIMAL, MONEY, DATE, DATETIME, BOOLEAN, SINGLE_SELECT, MULTI_SELECT, PARTY_REFERENCE, CLIENT_REFERENCE, USER_REFERENCE, adjusting only when an approved repository constraint requires it.
4. Allow optional PracticeArea scoping for definitions.
5. Validate values against definition data type on the backend.
6. Keep inactive definitions/options readable for historical values.
7. Validate tenant ownership of referenced Party/Client/User and definition/option IDs.
8. Provide minimal API/service operations required by dynamic forms and admin configuration; do not build a large admin product unless explicitly in scope.
9. Add tests for each important type family and cross-tenant references.

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

Phase is complete when custom values are typed and validated rather than stored in arbitrary core-entity extraData.

At the end, summarize the phase and point me to all files under `delivery/15-custom-fields-backend/`.
