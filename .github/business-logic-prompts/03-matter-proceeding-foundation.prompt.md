# Phase 03 — Matter, participants, and Proceedings

## Context to add manually

Attach/reference `delivery/01-domain-migration-plan/plan.md` and `delivery/02-party-client-foundation/changes.md` + `decisions.md`.

## Read before planning

- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Implement the new Matter aggregate and its core relationships without forcing a single Client or single court proceeding.

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
delivery/03-matter-proceeding-foundation/
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

1. Implement Matter with backend-generated internal number, title, DRAFT/OPEN/CLOSED state, PracticeArea, Stage, priority, responsible user, description, opened/closed dates, audit fields, and archive behavior.
2. Implement MatterClient as many-to-many and support at most one primary Client if that concept is retained in the approved plan.
3. Implement MatterParticipant and MatterParticipantRole.
4. Implement Proceeding as a separate entity under Matter.
5. Enforce same-tenant foreign references.
6. Implement indexes and uniqueness rules from the approved plan.
7. Implement backend/domain rules for draft/open state transition where model/service layer belongs, but do not build the full public Matter API until Phase 06 unless repository architecture requires a service foundation now.
8. Add tests for multiple Clients, participant roles, multiple Proceedings, number uniqueness/generation, and tenant safety.

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

Phase is complete when the Matter model supports the target relationships without relying on legacy single-client/single-court assumptions.

At the end, summarize the phase and point me to all files under `delivery/03-matter-proceeding-foundation/`.
