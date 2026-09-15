# Phase 05 — Client backend API

## Context to add manually

Attach/reference `delivery/02-party-client-foundation/changes.md`, `delivery/04-legacy-data-migration/verification.md`, and current API conventions discovered in Phase 00.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Implement/refactor the Client backend API around Party + Client + contact-person relationships.

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
delivery/05-client-api/
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

1. Implement create, list, detail, and update behavior using existing routing/controller/service/DTO conventions.
2. Support PERSON and ORGANIZATION creation rules.
3. Support multiple contact points, identifiers, addresses, and notes.
4. Support organization contact persons by linking an existing PERSON Party or creating a new PERSON Party plus PartyRelationship within a safe transaction/service workflow.
5. Support responsible user and client status if present in the approved model.
6. Return DTOs appropriate to list/detail screens rather than exposing ORM graphs.
7. Add Client autocomplete/search endpoint only if this phase's approved plan places it here; advanced related-contact matching is completed in Phase 18.
8. Validate every referenced ID against tenant and permission scope.
9. Maintain compatibility adapters only where the approved migration plan requires them.
10. Add positive and negative API tests.

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

Phase is complete when the new Client API supports the required model and does not leak or accept cross-tenant references.

At the end, summarize the phase and point me to all files under `delivery/05-client-api/`.
