# Phase 14 — Document frontend

## Context to add manually

Attach/reference `delivery/13-document-backend/changes.md`, `delivery/10-inline-create-lookups/changes.md`, and existing document/upload UI.

## Read before planning

- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement the Matter and Client document experiences against the new document/link model.

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
delivery/14-document-frontend/
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

1. Implement Matter Documents upload/list/search/category filter and appropriate actions.
2. Implement Client Documents with direct Client documents by default.
3. Add an option to include documents from the Client's Matters.
4. Deduplicate aggregated rows by Document identity.
5. Implement upload form with file, optional title, category searchable select + inline create, optional document date, optional description, and visibility.
6. Use existing upload progress/error patterns.
7. Respect authorization in UI but do not treat UI hiding as security.
8. Add tests for aggregation/deduplication and key form behavior.

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

Phase is complete when users can understand and manage document relationships without creating duplicate files.

At the end, summarize the phase and point me to all files under `delivery/14-document-frontend/`.
