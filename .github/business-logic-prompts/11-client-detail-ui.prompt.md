# Phase 11 — Client detail screen

## Context to add manually

Attach/reference `delivery/05-client-api/changes.md`, `delivery/08-client-form-ui/changes.md`, and existing Client detail/list components.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement/refactor the Client detail experience around the new domain.

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
delivery/11-client-detail-ui/
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

1. Create a compact header with display name, client code, Party type, status, edit action, and organization primary contact when available.
2. Implement tabs: Overview, Contact persons, Matters, Documents, Activity.
3. Overview shows core info, contact details, identifiers, addresses, primary contact, active Matters summary, notes, and recent activity when available.
4. Contact persons tab lists relationship, job title, primary status, email, and phone and supports add/link/edit flows that already exist.
5. Matters tab supports Active/Closed/All and links to Matter detail.
6. Documents and Activity may use a basic/placeholder data state only if their backend phases have not been completed; do not invent mock persistence.
7. Add responsive/loading/empty/error states and tests.

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

Phase is complete when the Client page exposes the new identity/contact model clearly without becoming a giant edit form.

At the end, summarize the phase and point me to all files under `delivery/11-client-detail-ui/`.
