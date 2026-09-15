# Phase 18 — Client and Matter search improvements

## Context to add manually

Attach/reference `delivery/05-client-api/changes.md`, `delivery/06-matter-api/changes.md`, and database/index findings from prior phases.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Improve practical search, especially resolving an organization Client from its contact person's identity/contact information.

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
delivery/18-search-improvements/
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

1. Implement Client search across display name, client code, direct contact points, identifiers, related contact-person name, related contact-person email, and related contact-person phone as approved.
2. Ensure search for a contact person's email can return the related organization Client.
3. Improve Matter search for internal number, title, and Client display name.
4. Review query plans/indexes appropriate to the current database and expected scale.
5. Do not introduce an external search engine unless the repository already uses one or measured requirements justify it and the user approves.
6. Keep autocomplete DTOs small.
7. Prevent tenant leakage through all search paths.
8. Add tests for contact-person-to-organization search and cross-tenant isolation.

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

Phase is complete when the key real-world lookup scenarios work with acceptable query behavior and tenant safety.

At the end, summarize the phase and point me to all files under `delivery/18-search-improvements/`.
