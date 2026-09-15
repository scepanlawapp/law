# Phase 07 — Configurable lookup API

## Context to add manually

Attach/reference `delivery/02-party-client-foundation/changes.md`, the actual lookup implementation, and `delivery/06-matter-api/decisions.md` if Matter API established lookup contract expectations.

## Read before planning

- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Expose safe firm-configurable lookup APIs for forms and administration.

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
delivery/07-lookup-api/
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

1. Implement list/create/update/deactivate for PracticeArea, MatterStage, ParticipantRole, ProceedingType, DocumentCategory, and OrganizationRelationshipType as present in the approved model.
2. Support active-only queries for forms.
3. Support PracticeArea-specific MatterStages if implemented.
4. Prevent hard deletion of values referenced by history.
5. Apply tenant scope to all reads and writes.
6. Return stable IDs/codes/labels needed by frontend caches.
7. Add duplicate-name/code handling according to approved product rules and existing database collation behavior.
8. Add tests for create/update/deactivate, historical references, and cross-tenant access.

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

Phase is complete when the frontend can populate and inline-create configurable lookup values without code deployment.

At the end, summarize the phase and point me to all files under `delivery/07-lookup-api/`.
