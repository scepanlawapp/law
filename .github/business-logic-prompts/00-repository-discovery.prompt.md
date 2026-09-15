# Phase 00 — Repository discovery and baseline

## Context to add manually

None. The repository itself is the context. Do not ask me to describe stack details that you can inspect.

## Read before planning

- `docs/legal-domain/README.md`
- `docs/legal-domain/01-product-principles.md`
- `docs/legal-domain/02-domain-map.md`
- `docs/legal-domain/13-implementation-order.md`

## Objective

Understand the real repository before any domain rewrite.

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
delivery/00-repository-discovery/
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

1. Identify backend language/framework, database, ORM/query layer, migration system, auth, tenant/firm model, validation/error-handling conventions, and test framework.
2. Identify frontend framework, routing, form/validation approach, server-state/query library, client state if relevant, UI/design system, table/autocomplete/select components, and test setup.
3. Map existing Client/Customer/Contact models and all fields, services, endpoints, DTOs, validators, permissions, screens, and tests.
4. Map existing Case/Matter models and all fields, services, endpoints, DTOs, validators, permissions, screens, and tests.
5. Map existing Document/storage models and links.
6. Identify lookup/enumeration patterns already used in the repository.
7. Identify current migrations and data that would be affected by the target model.
8. Find every important dependency on current client/case IDs or schema.
9. Create `delivery/00-repository-discovery/repository-analysis.md` in addition to the standard delivery files. It should contain the durable repository map and gap analysis.
10. Do not implement domain changes in this phase.

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

Phase is complete only when the repository analysis is sufficiently detailed to design a safe migration. No production/domain code should be changed.

At the end, summarize the phase and point me to all files under `delivery/00-repository-discovery/`.
