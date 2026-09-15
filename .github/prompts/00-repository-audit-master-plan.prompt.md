# Phase 00 — Repository audit and master implementation plan

## Context to add manually

None. The repository itself is the context. Do not ask me to describe stack details, paths, models, or conventions that you can inspect.

## Read before planning

- `docs/legal-domain/README.md`
- `docs/legal-domain/01-product-principles.md`
- `docs/legal-domain/02-domain-map.md`
- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/05-documents.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/07-frontend-ux.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/10-migration-data-safety.md`
- `docs/legal-domain/11-activity-audit.md`
- `docs/legal-domain/12-definition-of-done.md`

## Objective

Understand the real repository and produce one repository-specific master migration/implementation plan. Do **not** implement product/domain changes in this phase.

## Delivery folder

`delivery/00-repository-audit-master-plan/`

## Work

### 1. Audit the repository

Identify:

- Nx apps/libraries and feature boundaries;
- Angular routing, services/stores, typed forms, localization, Spartan/UI components, tables, autocomplete/select/dialog patterns, and tests;
- NestJS modules/controllers/services, auth, tenant context, permissions, validation/error handling, and tests;
- Prisma schema, migrations, seed strategy, transactions, and important indexes/constraints;
- shared contracts in `libs/api/api-interfaces/src/lib/`;
- current Client/Contact/Case/Matter/Document models and all important dependencies;
- current enum/lookup patterns;
- current file-storage and document-link model;
- current pagination, filtering, search, and autocomplete conventions.

### 2. Create a gap analysis

For each target concept, decide whether it already exists, should be adapted, or must be added:

- Party;
- PartyContactPoint;
- PartyIdentifier;
- PartyAddress;
- PartyRelationship;
- Client;
- PracticeArea / MatterStage / ParticipantRole / ProceedingType / DocumentCategory / OrganizationRelationshipType;
- Matter;
- MatterClient;
- MatterParticipant + roles;
- Proceeding;
- Document links;
- Custom Fields;
- ActivityEvent.

### 3. Design the migration

For each existing Client/Case/Document structure classify it as:

- keep;
- extend;
- migrate;
- temporarily deprecate;
- remove only after final verification.

Design a safe expand-and-contract path.

Explicitly identify ambiguous mappings and ask me rather than guessing.

### 4. Create durable repository analysis

In addition to the standard delivery files create:

`delivery/00-repository-audit-master-plan/repository-analysis.md`

It must contain the durable repository map and gap analysis used by later phases.

## Completion gate

Complete only when the repository analysis and master migration plan are detailed enough for safe implementation. Do not change product/domain runtime code.

## Mandatory Plan-mode protocol

Work in **Plan mode first**.

Before implementation:

1. Read `.github/copilot-instructions.md`.
2. Read the specification files listed in this prompt.
3. Read the previous delivery artifacts listed under `Context to add manually`.
4. Inspect the relevant Nx workspace code, Prisma schema/migrations, shared contracts, NestJS modules/services/controllers, Angular features/services/forms/stores, tests, and existing UI patterns.
5. For frontend work, read `.github/skills/spartan-ui/SKILL.md`.
6. Prefer repository facts over assumptions.
7. Ask me for information only when it is genuinely needed and cannot be reliably discovered from the repository.
8. If nothing is blocking, explicitly write: `No blocking questions.`
9. Produce one concrete implementation plan for the whole phase before changing application code.

The plan must include:

- repository findings;
- in-scope and out-of-scope work;
- expected files/modules to change;
- shared-contract impact;
- Prisma/migration impact;
- NestJS/API impact;
- Angular/UI impact;
- tenant/security impact;
- compatibility and data-safety risks;
- tests and verification commands;
- rollback/data-safety notes;
- decisions requiring my approval.

Do not modify application code until I approve the plan.

## Delivery tracking

Create and maintain the delivery folder specified by this prompt with:

```text
plan.md
changes.md
decisions.md
verification.md
open-questions.md
```

If Plan mode cannot write files, include the proposed `plan.md` content in the Plan response and create the delivery files immediately after execution begins.

Rules:

- keep `changes.md` aligned with actual changes;
- record durable decisions and deviations in `decisions.md`;
- record only checks that were actually run in `verification.md`;
- record unresolved/deferred items in `open-questions.md`;
- write `None.` when there are no open questions;
- never claim a check passed if it was not run.

## General constraints

- Reuse the existing Nx + Angular 22 + NestJS + Prisma + PostgreSQL + shared-contract + Spartan/UI architecture.
- Preserve existing data.
- Prefer additive / expand-and-contract migrations.
- Do not invent placeholder business values.
- Preserve tenant isolation and authorization.
- Validate browser-supplied IDs on the backend.
- Do not expose Prisma models directly to Angular.
- Keep truly shared contracts under `libs/api/api-interfaces/src/lib/` and re-export them through `api-interfaces.ts`.
- Do not refactor unrelated areas.
- Do not introduce another UI library, ORM, search engine, or state architecture without explicit approval.
- Add/update tests for important rules introduced in the phase.
- If a newly discovered issue materially changes product behavior or migration safety, stop that workstream and ask me.
