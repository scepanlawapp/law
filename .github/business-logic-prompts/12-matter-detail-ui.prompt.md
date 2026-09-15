# Phase 12 — Matter detail screen

## Context to add manually

Attach/reference `delivery/06-matter-api/changes.md`, `delivery/09-matter-form-ui/changes.md`, and existing Matter/Case detail components.

## Read before planning

- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/07-frontend-ux.md`

## Objective

Implement/refactor the Matter detail workspace around the new Matter model.

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
delivery/12-matter-detail-ui/
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

1. Create a compact header with internal number, title, state, PracticeArea, priority, primary Client, responsible user, and opened date.
2. Implement tabs: Overview, Documents, Participants, Proceedings, Activity.
3. Overview summarizes information, Clients, participants, Proceedings, recent Documents, and recent Activity when available.
4. Participants tab supports adding/removing Parties and managing multiple roles.
5. Proceedings tab supports the approved create/edit/archive/remove behavior.
6. Do not render every database field on Overview.
7. Use existing edit-page/modal patterns instead of inventing a parallel editing system.
8. Add responsive/loading/empty/error states and tests.

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

Phase is complete when Matter detail provides a usable workspace that can later accept Tasks, Calendar, Finance, Email, and AI tabs without redesign.

At the end, summarize the phase and point me to all files under `delivery/12-matter-detail-ui/`.
