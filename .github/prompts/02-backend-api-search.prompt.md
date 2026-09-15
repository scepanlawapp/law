# Phase 02 — Shared contracts, backend APIs, lookups, and search

## Context to add manually

Attach/reference:

- `delivery/01-core-domain-migration/changes.md`
- `delivery/01-core-domain-migration/decisions.md`
- `delivery/01-core-domain-migration/verification.md`

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/08-api-search.md`
- `docs/legal-domain/09-security-tenancy.md`

## Objective

Expose the new domain through stable shared TypeScript contracts and tenant-safe NestJS APIs, including configurable lookup APIs and practical search/autocomplete.

## Delivery folder

`delivery/02-backend-api-search/`

## Work

### 1. Shared contracts

Create/refactor modular shared contracts under `libs/api/api-interfaces/src/lib/`.

Re-export through `api-interfaces.ts`.

Create fit-for-purpose contracts for:

- create/update;
- detail;
- list rows;
- filters;
- autocomplete;
- relationships.

Do not expose Prisma generated models.

### 2. Client API

Support:

- person Client creation;
- organization Client creation;
- multiple contact points;
- identifiers;
- addresses;
- notes/status/responsible User as approved;
- organization contact persons;
- linking existing PERSON Party;
- creating new contact PERSON + PartyRelationship transactionally;
- list/detail/update/archive/deactivate.

Validate every reference within tenant/permission scope.

### 3. Matter API

Support:

- create Draft;
- Open transition requiring at least one Client;
- list/detail/update;
- multiple MatterClients;
- primary Client behavior if approved;
- participants + multiple roles;
- Proceedings;
- lifecycle transitions;
- filters by state, PracticeArea, Stage, responsible User, Client, priority;
- existing pagination/sorting conventions.

### 4. Lookup API

Implement list/create/update/deactivate for all configurable lookups.

Support active-only form queries and PracticeArea-specific MatterStages when approved.

Historical referenced values must remain readable after deactivation.

### 5. Search/autocomplete

Implement server-side autocomplete/search for Clients, Parties, and Users where required.

Client search should match:

- display name;
- client code;
- direct contact points;
- identifiers;
- organization contact-person name;
- organization contact-person email;
- organization contact-person phone.

Key scenario:

`jelena@abc.rs` should be able to find `ABC DOO` when Jelena is a related contact person.

Matter search must cover at least:

- internal number;
- title;
- Client display name.

Use PostgreSQL/index/query capabilities first; do not introduce a search engine.

### 6. Verify

Add positive/negative tests for:

- lifecycle rules;
- tenant isolation;
- cross-tenant IDs;
- search/autocomplete leakage;
- relationships;
- lookups;
- pagination/filtering/search.

## Completion gate

Complete when the new core domain is usable through stable, tested shared contracts and tenant-safe APIs.

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
