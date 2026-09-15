# Phase 20 — Legacy cleanup and final verification

## Context to add manually

Attach/reference `delivery/01-domain-migration-plan/plan.md`, `delivery/04-legacy-data-migration/verification.md`, `delivery/19-security-tenant-audit/verification.md`, and any open questions from phases 00–19.

## Read before planning

- `docs/legal-domain/12-definition-of-done.md`
- `docs/legal-domain/13-implementation-order.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Remove verified-unused legacy runtime code, finalize compatibility, and perform an end-to-end definition-of-done review.

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
delivery/20-legacy-cleanup/
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

1. Identify legacy Client/Case models, fields, DTOs, validators, endpoints, components, enum values, and adapters that no longer have runtime references.
2. Do not delete historical database migration files.
3. Do not drop legacy database storage until migration verification and rollback requirements make that safe and the approved plan allows it.
4. Remove only runtime code whose references have been verified.
5. Run repository-standard tests, typecheck, lint/format checks, and build relevant to the changed areas.
6. Run or document end-to-end/manual checks for the Client and Matter Definition of Done.
7. Review all `delivery/*/open-questions.md` and consolidate remaining work.
8. Create `delivery/20-legacy-cleanup/final-status.md` summarizing completed capabilities, deferred items, known limitations, and recommended next product phases.

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

Phase is complete only when cleanup is data-safe, the new runtime path is authoritative, verification is documented, and remaining limitations are explicit.

At the end, summarize the phase and point me to all files under `delivery/20-legacy-cleanup/`.
