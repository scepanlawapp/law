# Repository-wide Copilot instructions

## Purpose

This repository contains a legal practice management application.

The current Client/Case implementation may be an early version. When work relates to clients, parties, matters, proceedings, documents, configurable lookups, custom fields, activity history, or their UI/API, treat the documents under `docs/legal-domain/` as the target domain specification.

Start with `docs/legal-domain/README.md`, then read the documents relevant to the task.

## Mandatory behavior

- Inspect the existing repository before proposing implementation details.
- Reuse the existing architecture, framework, ORM, validation library, design system, form library, query/state library, authentication, tenancy, logging, error handling, testing framework, and naming conventions whenever reasonable.
- Do not create a parallel architecture merely because another approach is common.
- Do not guess repository-specific facts that can be discovered from code.
- Ask the user for information only when it is genuinely needed and cannot be reliably discovered from the repository.
- When a blocking or materially ambiguous decision remains, ask before implementing it.
- When no blocking information is needed, explicitly state `No blocking questions.` in the plan and continue.
- Do not broaden the requested phase into unrelated refactors.

## Plan-mode workflow

For numbered implementation phases under `.github/prompts/`:

1. Work in Plan mode first.
2. Read the requested specification and prior delivery artifacts.
3. Inspect the relevant application code, migrations, tests, and UI components.
4. Ask any needed blocking questions.
5. Produce a concrete implementation plan with impacted files, migration risks, API changes, test strategy, and rollback/data-safety considerations.
6. Do not modify application code until the user approves execution.

If Plan mode cannot write files, include the proposed `delivery/<phase>/plan.md` content in the plan and create/update the delivery files immediately when execution begins.

## Delivery tracking

Every numbered phase must create and maintain:

```text
delivery/NN-phase-name/
├── plan.md
├── changes.md
├── decisions.md
├── verification.md
└── open-questions.md
```

Rules:

- `plan.md`: approved scope, repository findings, impacted files, migration/API/UI plan, risks, test plan.
- `changes.md`: actual changes made, grouped by backend/frontend/database/tests/docs. Include notable deviations from the approved plan.
- `decisions.md`: durable implementation decisions and why they were made. Record alternatives when important.
- `verification.md`: commands/checks run and their results. Never claim a check was run if it was not run.
- `open-questions.md`: unresolved questions, deferred work, known limitations, and follow-up items. If none, write `None.`

Keep delivery files concise but sufficient for the next Copilot phase to understand what actually happened.

## Data model principles

- `Party` is the real person or organization.
- `Client` is the office/firm's client relationship with a Party.
- An organization may have multiple contact persons. Contact persons are separate `Party` records of type `PERSON`, connected through `PartyRelationship`.
- A Party may have multiple contact points, identifiers, and addresses.
- A `Matter` is the law firm's internal matter/workspace.
- A Matter can have multiple Clients.
- A Matter can have multiple participants and participant roles.
- A `Proceeding` is a concrete court/administrative/arbitration/enforcement/etc. proceeding within a Matter.
- A Matter can have multiple Proceedings.
- The firm's internal matter number is not the same as an external court/proceeding number.
- A physical Document is stored once and may be linked to Client, Matter, and/or Proceeding.
- Values that the application needs for program logic may be code enums.
- Values a law firm may reasonably customize must be database-backed lookup/configuration data, not large hard-coded enums.
- Domain-specific extra data belongs in typed custom fields, not arbitrary catch-all JSON on core entities.
- Important business history should be archived/deactivated rather than hard-deleted.

## Tenant and security rules

- All firm-owned business data must be tenant scoped.
- Do not trust a `firm_id` or tenant identifier supplied by the browser.
- Resolve firm/tenant identity from authenticated context using the repository's existing approach.
- Every referenced ID from a request must be checked for tenant ownership and permission.
- Autocomplete/search endpoints must not leak cross-tenant data.
- A document from one tenant must never be linkable to an entity in another tenant.

## Migration rules

- Use migrations for schema changes.
- Do not rewrite migrations that may already have been applied.
- Prefer additive/expand-and-contract migration steps.
- Preserve existing Client/Case data.
- Do not invent fake placeholder business values to satisfy a new schema.
- Do not remove legacy storage until migrated data and the new runtime path have been verified.
- Include verification queries/tests for important data migrations.

## Frontend rules

- Use the repository's existing design system and UX conventions.
- Use searchable autocomplete for potentially large entity lists.
- Use searchable selects for configurable lookup values.
- Configurable lookup selects should support inline creation where specified.
- Use radio/segmented control for a small mutually exclusive choice such as PERSON vs ORGANIZATION.
- Avoid giant forms full of rarely used optional fields; use clear sections and progressive disclosure.
- Backend validation remains authoritative.

## Testing and completion

For each phase:

- Add or update tests for important business rules.
- Run the most relevant unit/integration tests.
- Run type checking, linting, formatting, and build checks that are standard for the repository when applicable.
- Fix failures caused by the phase.
- Do not silently repair unrelated pre-existing failures.
- Record exact verification in `delivery/<phase>/verification.md`.

## Scope control

Complete only the requested numbered phase unless a small prerequisite is essential. If a prerequisite materially expands scope, surface it in Plan mode before implementation.
