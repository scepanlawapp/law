# Phase 01 — Concrete domain and migration plan

## Context to add manually

Attach or reference `delivery/00-repository-discovery/repository-analysis.md` and `delivery/00-repository-discovery/open-questions.md`.

## Read before planning

- `docs/legal-domain/02-domain-map.md`
- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Translate the stack-neutral target domain into a repository-specific staged migration plan.

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
delivery/01-domain-migration-plan/
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

1. Map each target entity to the repository's naming and architecture.
2. For every existing Client/Case/Document model, classify it as keep, extend, migrate, deprecate, or remove later.
3. Design the concrete schema changes, relationships, constraints, indexes, and tenant ownership strategy.
4. Design an expand-and-contract migration sequence that preserves existing data.
5. Specify how existing person/company fields map to Party, Client, PartyContactPoint, PartyIdentifier, and PartyAddress.
6. Specify how existing Case data maps to Matter, MatterClient, and Proceeding when semantics are clear.
7. Identify ambiguous mappings and ask product questions instead of guessing.
8. Design the internal matter-number migration/generation approach consistent with current behavior.
9. Plan API compatibility or temporary adapters if current frontend/contracts require them.
10. Plan test and data-verification gates for every destructive-risk step.
11. Do not implement the migration yet.

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

Phase is complete when there is an approved, repository-specific implementation sequence with no unacknowledged data-loss risk.

At the end, summarize the phase and point me to all files under `delivery/01-domain-migration-plan/`.
