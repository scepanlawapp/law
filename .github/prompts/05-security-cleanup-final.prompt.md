# Phase 05 — Security audit, legacy cleanup, and final verification

## Context to add manually

Attach/reference:

- all prior `verification.md` files;
- all prior `open-questions.md` files;
- repository auth/tenant/permission code only if Copilot does not automatically inspect it.

## Read before planning

- `docs/legal-domain/09-security-tenancy.md`
- `docs/legal-domain/10-migration-data-safety.md`
- `docs/legal-domain/12-definition-of-done.md`

## Objective

Audit the finished legal domain end-to-end, fix security gaps, remove verified-unused legacy runtime code, and produce final status.

## Delivery folder

`delivery/05-security-cleanup-final/`

## Work

### 1. Security/tenant audit

Audit for:

- IDOR;
- cross-tenant reads/writes;
- cross-tenant relation assignment;
- autocomplete leakage;
- Client↔Party;
- organization contact relationships;
- MatterClients;
- participants/roles;
- Proceedings;
- configurable lookup IDs;
- Documents;
- custom-field definitions/options/reference values;
- Activity queries.

Add representative negative integration tests and fix defects.

### 2. Legacy cleanup

Identify obsolete legacy Client/Case:

- models/types;
- DTOs;
- services;
- endpoints;
- validators;
- components;
- enums;
- adapters;
- compatibility code.

Remove only code proven unused after the new path is authoritative.

Do not delete historical Prisma migration files.

Do not drop legacy DB storage unless the approved migration plan and verification make it safe.

### 3. Definition-of-Done review

Verify against:

`docs/legal-domain/12-definition-of-done.md`

Document what is:

- complete;
- intentionally deferred;
- limited;
- blocked.

### 4. Repository verification

Run the actual configured Nx/Prisma checks relevant to the work:

- tests;
- lint;
- typecheck if configured;
- build;
- Prisma validation/migration status;
- relevant API/integration tests;
- relevant frontend tests.

Fix failures caused by this implementation.

Record unrelated pre-existing failures instead of silently expanding scope.

### 5. Final status

Create:

`delivery/05-security-cleanup-final/final-status.md`

Include:

- completed capabilities;
- final architecture summary;
- migration status;
- removed legacy paths;
- known limitations;
- deferred items;
- recommended next product phases;
- remaining security/data risks.

## Completion gate

Complete only when known legal-domain IDOR/cross-tenant defects are fixed or explicitly block release, cleanup is data-safe, and final verification is documented.

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
