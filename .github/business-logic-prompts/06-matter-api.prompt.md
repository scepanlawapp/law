# Phase 06 — Matter backend API

## Context to add manually

Attach/reference `delivery/03-matter-proceeding-foundation/changes.md`, `delivery/04-legacy-data-migration/verification.md`, and `delivery/05-client-api/decisions.md`.

## Read before planning

- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Implement/refactor the Matter API, including Clients, participants, Proceedings, filtering, and lifecycle rules.

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
delivery/06-matter-api/
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

1. Implement Matter create, list, detail, and update using repository conventions.
2. Allow Draft creation with the minimum approved data.
3. Require at least one Client when opening a Matter in V1.
4. Support multiple MatterClients and primary Client behavior if approved.
5. Implement add/update/remove workflows for participants and roles.
6. Implement create/update/remove-or-archive workflows for Proceedings according to data-history rules.
7. Add Matter filters for state, PracticeArea, Stage, responsible user, Client, and priority where supported by product plan.
8. Add search for at least internal number, title, and Client display name.
9. Use existing pagination and sorting conventions.
10. Validate all foreign IDs and transitions on the backend.
11. Add API/domain tests including negative tenant cases.

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

Phase is complete when the API expresses the target Matter model without legacy single-client or single-proceeding constraints.

At the end, summarize the phase and point me to all files under `delivery/06-matter-api/`.
