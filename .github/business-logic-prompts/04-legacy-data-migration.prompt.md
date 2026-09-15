# Phase 04 — Legacy Client and Case data migration

## Context to add manually

Attach/reference `delivery/01-domain-migration-plan/plan.md`, `delivery/02-party-client-foundation/verification.md`, and `delivery/03-matter-proceeding-foundation/verification.md`.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Migrate existing Client/Case data into the new model while preserving data and a rollback/verification path.

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
delivery/04-legacy-data-migration/
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

1. Implement the approved data migration/backfill exactly according to the repository-specific mapping.
2. Create Party records for existing identities and Client records for client relationships.
3. Move existing emails/phones/identifiers/addresses into the new child structures when mapping is unambiguous.
4. Create Matters from existing Cases and MatterClient links from existing relationships.
5. Create Proceedings from legacy court/case-number fields only where the meaning is established by the approved plan.
6. Do not invent missing business values.
7. Keep legacy structures required for compatibility until cleanup phase.
8. Add verification checks for counts, orphaned data, duplicates, tenant ownership, and representative sample mappings.
9. Document any records that cannot be safely migrated.

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

Do not proceed to API cutover if verification reveals data loss, unexplained count mismatches, cross-tenant relationships, or ambiguous migrations that need user decisions.

At the end, summarize the phase and point me to all files under `delivery/04-legacy-data-migration/`.
