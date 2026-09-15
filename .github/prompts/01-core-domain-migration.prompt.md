# Phase 01 — Core domain, Prisma schema, and legacy data migration

## Context to add manually

Attach/reference:

- `delivery/00-repository-audit-master-plan/repository-analysis.md`
- `delivery/00-repository-audit-master-plan/plan.md`
- `delivery/00-repository-audit-master-plan/decisions.md`
- answered blocking items from `open-questions.md`

## Read before planning

- `docs/legal-domain/02-domain-map.md`
- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/10-migration-data-safety.md`

## Objective

Implement the stable core legal domain and safely migrate existing Client/Case data without yet doing the full frontend rewrite.

## Delivery folder

`delivery/01-core-domain-migration/`

## Work

### 1. Party and Client foundation

Implement the approved repository-specific versions of:

- Party;
- PartyContactPoint;
- PartyIdentifier;
- PartyAddress;
- PartyRelationship;
- Client.

Requirements:

- PERSON / ORGANIZATION;
- organization contacts are separate PERSON Parties;
- multiple contact points, identifiers, and addresses;
- Client references Party rather than duplicating identity;
- correct tenant scope, audit/archive behavior, constraints, and indexes.

### 2. Configurable lookup foundation

Implement:

- PracticeArea;
- MatterStage;
- ParticipantRole;
- ProceedingType;
- DocumentCategory;
- OrganizationRelationshipType.

Seed useful defaults using an idempotent project-appropriate approach.

Do not make office-customizable values giant code enums.

### 3. Matter and Proceeding foundation

Implement:

- Matter;
- MatterClient;
- MatterParticipant;
- MatterParticipantRole;
- Proceeding.

Requirements:

- backend-generated internal Matter number;
- DRAFT / OPEN / CLOSED;
- archive separate from lifecycle;
- LOW / NORMAL / HIGH / URGENT priority;
- multiple Clients;
- optional single primary Client if approved;
- multiple participants/roles;
- multiple Proceedings;
- no permanent single `matter.clientId`;
- no assumption that one court number/court/judge represents the whole Matter.

### 4. Migrate existing data

Apply the approved mapping:

- legacy person/company → Party;
- client relationship → Client;
- emails/phones → PartyContactPoint;
- identifiers → PartyIdentifier;
- addresses → PartyAddress;
- Case → Matter;
- Case/Client relation → MatterClient;
- court/case-number/judge → Proceeding only when semantics are clear.

Do not invent missing business values.

Keep compatibility structures needed for rollback/runtime until final cleanup.

### 5. Verify

Add tests and migration checks for:

- source/target counts;
- orphaned rows;
- duplicates;
- tenant ownership;
- PartyRelationship correctness;
- multiple Clients;
- multiple Proceedings;
- internal Matter-number generation/uniqueness;
- representative migrated records.

## Completion gate

Do not continue if verification shows unexplained data loss, cross-tenant relationships, unsafe duplicates, or unresolved ambiguous mappings.

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
