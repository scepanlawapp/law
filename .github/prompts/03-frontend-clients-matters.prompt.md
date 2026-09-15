# Phase 03 — Client and Matter frontend workflows

## Context to add manually

Attach/reference:

- `delivery/02-backend-api-search/changes.md`
- `delivery/02-backend-api-search/decisions.md`
- relevant existing Angular Client/Case feature files if Copilot has not already inspected them

## Read before planning

- `docs/legal-domain/03-party-client.md`
- `docs/legal-domain/04-matter-proceeding.md`
- `docs/legal-domain/06-lookups-custom-fields.md`
- `docs/legal-domain/07-frontend-ux.md`
- `.github/skills/spartan-ui/SKILL.md`

## Objective

Replace the early Client/Case UI with the new domain using Angular 22, typed Reactive Forms, Signals where appropriate, Tailwind semantic tokens, and Spartan/UI.

## Delivery folder

`delivery/03-frontend-clients-matters/`

## Work

### 1. Client create/edit

Use:

- Person / Organization segmented control or radio;
- Person: First name + Last name required;
- Organization: Legal name required, Trade name optional;
- repeatable contact details;
- identifiers;
- addresses;
- notes;
- organization contact persons.

For organization contact persons support:

- link existing Person via autocomplete;
- create new Person inline;
- relationship type;
- job title;
- department;
- primary contact.

Use progressive disclosure instead of one giant form.

### 2. Matter create/edit

Use:

- Title → text input;
- Clients → multi-autocomplete;
- quick-create Client using existing UI patterns;
- PracticeArea → searchable select;
- MatterStage → searchable select;
- Priority → system select/control;
- Responsible User → autocomplete;
- Opened date → date picker;
- Description → textarea;
- Participants section;
- Proceedings section;
- Save Draft;
- Open Matter.

Backend transition validation remains authoritative.

### 3. Inline configurable lookup creation

Implement a reusable, small pattern for:

- PracticeArea;
- MatterStage;
- ParticipantRole;
- ProceedingType;
- OrganizationRelationshipType;
- DocumentCategory-ready behavior for the next phase.

Where permitted show:

`+ Add "<typed value>"`

After creation:

- close UI;
- invalidate/refresh lookup data;
- select the created option.

### 4. Client detail

Tabs:

- Overview;
- Contact persons;
- Matters;
- Documents;
- Activity.

Documents/Activity may show basic integration/empty state until Phase 04, but do not invent fake persistence.

### 5. Matter detail

Tabs:

- Overview;
- Documents;
- Participants;
- Proceedings;
- Activity.

Support participant role management and Proceeding management.

Keep the layout extensible for future Tasks, Calendar, Finance, Email, and AI.

### 6. UI quality

Add:

- loading;
- empty;
- API error;
- typed form validation;
- accessibility/focus handling;
- Spartan select label mapping through existing helpers;
- responsive behavior;
- relevant frontend tests.

## Completion gate

Complete when users can create/edit/view person and organization Clients, manage multiple organization contacts, and create/edit/view Matters with multiple Clients, participants, and Proceedings.

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
