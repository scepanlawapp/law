# Phase 02 — Party, Client, contacts, and lookup foundation

## Context to add manually

Attach/reference `delivery/01-domain-migration-plan/plan.md`, `decisions.md`, and any answered open questions.

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Implement the domain/database foundation for Party, Client, contact data, organization contact-person relationships, and configurable lookup infrastructure required by later phases.

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
delivery/02-party-client-foundation/
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

1. Implement Party with PERSON/ORGANIZATION semantics using repository conventions.
2. Implement PartyContactPoint, PartyIdentifier, and PartyAddress.
3. Implement PartyRelationship and a configurable relationship-type lookup or the repository-specific equivalent.
4. Implement Client as the firm's relationship with Party, not a duplicate identity.
5. Implement initial configurable lookup entities needed by the domain: PracticeArea, MatterStage, ParticipantRole, ProceedingType, DocumentCategory, and OrganizationRelationshipType, unless the approved phase plan intentionally splits lookup tables into Phase 07.
6. Seed defaults in an idempotent/repository-appropriate way and keep them firm scoped.
7. Add constraints and indexes identified by the approved plan.
8. Do not migrate legacy Client records yet unless the approved migration plan explicitly requires a compatibility backfill in this step.
9. Add domain/model/repository tests, including tenant boundaries where practical.

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

Phase is complete when the new foundation exists safely, tests pass for the new rules, and existing runtime behavior is not accidentally broken.

At the end, summarize the phase and point me to all files under `delivery/02-party-client-foundation/`.
