# Project Development Guidelines

## Project Overview

This project is an AI-powered law office management application built inside an **Nx Monorepo**.

The application combines:

- Law office management (Matters/Cases, Clients, Documents, Tasks, Deadlines, Calendar)
- Business & Financial management
- AI-assisted legal workflows and specialized AI agents

### Tech Stack

- **Frontend:** Angular 22 (Standalone Components, Signals, Reactive Forms, Tailwind CSS v4, Spartan/UI)
- **Backend:** NestJS
- **ORM:** Prisma
- **Database:** PostgreSQL
- **Shared Workspace Contracts:** Shared TypeScript API/domain contracts in `libs/api/api-interfaces/src/lib/api-interfaces.ts`

---

# 1. Workspace Architecture & Path Mappings

Organize the application strictly around feature boundaries and domain models within the Nx monorepo:

```text
UI (Spartan/UI Helm & Primitives)
  ↓
Frontend Feature Module (`apps/web/src/app/...`)
  ↓
Angular Service / Signal Store
  ↓
Shared Contracts (`libs/api/api-interfaces/src/lib/api-interfaces.ts`)
  ↓
NestJS Controller (`apps/api/src/app/...`)
  ↓
NestJS Application / Service Layer
  ↓
Prisma Database ORM / File Storage / AI Workflows
```

Do not introduce a parallel architecture for new Client, Party, Matter, Proceeding, Document, lookup, custom-field, or activity features.

Before creating a new pattern, first inspect whether the repository already contains an equivalent:

- service;
- shared contract;
- validator;
- mapper;
- store;
- UI component;
- dialog/drawer;
- data table;
- autocomplete;
- select;
- pagination helper;
- error handler;
- permission guard;
- transaction helper.

Prefer extending existing patterns over duplicating them.

---

# 2. Workspace Contracts & Type Sharing

## Shared contracts

All TypeScript interfaces, DTOs, type aliases, and enums that are intentionally shared between NestJS backend and Angular frontend MUST live in modular files under:

```text
libs/api/api-interfaces/src/lib/
```

and MUST be re-exported through:

```text
libs/api/api-interfaces/src/lib/api-interfaces.ts
```

Examples:

```text
party.interface.ts
client.interface.ts
matter.interface.ts
proceeding.interface.ts
document.interface.ts
lookup.interface.ts
custom-field.interface.ts
activity.interface.ts
```

Use the actual repository naming convention discovered in the existing codebase.

## Prisma models are not API contracts

Prisma models are persistence models and MUST NOT be exposed directly to the Angular application.

Required separation:

```text
Prisma persistence model
  ↓
NestJS mapper/service
  ↓
Shared API contract / DTO
  ↓
Angular service/store/component
```

Do not import Prisma-generated model types into frontend code.

Do not shape public API responses around Prisma relations merely because Prisma generated them that way.

## Technology-specific types

Types/classes/models used exclusively in one layer stay in that layer.

Examples:

- Angular form view-models → frontend only
- Angular UI state → frontend only
- NestJS authenticated request context → backend only
- Prisma query helpers → backend only
- internal mapper types → backend only

---

# 3. Angular 22 Best Practices

## Standalone architecture

All Angular components, directives, and pipes MUST be standalone.

Use Angular 22 patterns consistently.

## Signals

Use:

```text
signal()
computed()
effect()
toSignal()
toObservable()
```

according to their intended semantics.

Rules:

- `signal()` for local/application state where Signals are appropriate.
- `computed()` for derived state.
- `effect()` strictly for side effects.
- `toSignal()` / `toObservable()` when bridging Angular Signals and RxJS.
- Avoid unnecessary RxJS `Subject` / `BehaviorSubject` state containers when Signals provide a simpler solution.

Do not convert every HTTP flow into custom signal infrastructure when the existing project has an established query/service pattern.

## Dependency injection

Prefer functional:

```ts
inject(...)
```

over constructor injection.

## Angular control flow

Use:

```text
@if
@for
@switch
@defer
```

Do NOT introduce:

```text
*ngIf
*ngFor
```

into new code.

## Forms

Use typed Reactive Forms for complex legal/business forms.

Backend validation remains authoritative.

Frontend validation exists for UX and early feedback, not for security or data integrity.

## Select value/label mapping

For Spartan/UI selects, never display the raw stored value in the selected trigger when a human-readable/localized label exists.

Keep options as:

```ts
{ value, label }
```

where `label` is the translation key or human-readable label according to the existing localization pattern.

Use:

```text
itemToString
createSelectItemToString
```

from:

```text
apps/web/src/app/shared/utils.ts
```

Example:

```ts
readonly themeOptions = [
  { value: "SYSTEM", label: "settings.system" },
  { value: "LIGHT", label: "settings.light" },
];

readonly themeItemToString = createSelectItemToString(
  this.themeOptions,
  (key) => this.localization.translate(key),
);
```

When rendering a Spartan select, bind `[itemToString]` and keep the trigger compatible with the project's `<hlm-select-value />` pattern.

---

# 4. Styling, Semantic Tokens & Tailwind CSS v4

Components MUST rely on semantic design tokens instead of hard-coded theme colors.

## Semantic token roles

Primary roles include:

```text
--background
--foreground

--card
--card-foreground

--popover
--popover-foreground

--primary
--primary-foreground

--secondary
--secondary-foreground

--muted
--muted-foreground

--accent
--accent-foreground

--destructive
--destructive-foreground

--border
--input
--ring
```

## Light & dark themes

Theme switching is controlled through:

```html
<html data-theme="light">
<html data-theme="dark">
```

Do not introduce arbitrary hard-coded dark classes such as:

```text
dark:bg-slate-900
```

when semantic tokens already cover that role.

## Accent colors

Supported UI accent values:

```text
blue
turquoise
coral
purple
```

Accent switching is driven by:

```html
<html data-accent="blue">
<html data-accent="turquoise">
<html data-accent="coral">
<html data-accent="purple">
```

Components must consume semantic token classes rather than hard-coding accent palettes.

---

# 5. Spartan/UI Integration

Spartan/UI is the primary frontend UI system.

Use:

- `@spartan-ui/brain`
- `@spartan-ui/helm`
- existing project wrappers/components

as the primary building blocks.

Before scaffolding or styling Spartan/UI components, read:

```text
.github/skills/spartan-ui/SKILL.md
```

Keep UI components:

- small;
- focused;
- accessible;
- reusable where reuse is real;
- driven by semantic tokens;
- consistent with existing application patterns.

Do not introduce a second general-purpose UI library for this domain.

---

# 6. Legal Domain Documentation

The durable product/domain specification for the legal management core lives under:

```text
docs/legal-domain/
```

Start with:

```text
docs/legal-domain/README.md
```

When working on Clients, Parties, organization contact persons, Matters, Proceedings, Documents, lookups, custom fields, activity history, related API, migrations, or UI, read the relevant documents from that directory before planning changes.

The documentation is product/domain authority.

The repository remains authority for implementation mechanics and established technical conventions.

When an existing implementation conflicts with the target domain:

1. preserve data first;
2. preserve security and tenant isolation;
3. identify the conflict in Plan mode;
4. propose a staged migration;
5. ask the user when the conflict represents a genuine product decision.

---

# 7. Core Legal Domain Model

## Party

`Party` represents a real-world person or organization.

System enum:

```text
PERSON
ORGANIZATION
```

A Party is NOT automatically a Client.

## Client

`Client` represents the law firm's business relationship with a Party.

Therefore:

```text
Party != Client
```

Do not duplicate identity data into Client when it belongs to Party.

## Organization contact persons

An organization may have multiple contact persons.

Each contact person MUST be modeled as a separate `Party` of type:

```text
PERSON
```

and connected to the organization through `PartyRelationship`.

Do NOT model organization contacts as fields such as:

```text
client.contactPersonName
client.contactPersonEmail
client.contactPersonPhone
```

This separation is required so the application can later identify the organization from an employee/contact person's email, phone, or name.

Example:

```text
jelena@abc.rs
  ↓
Jelena Jovanović (Party PERSON)
  ↓
PartyRelationship
  ↓
ABC DOO (Party ORGANIZATION)
  ↓
Client
  ↓
active Matters
```

## Party contact data

A Party may have multiple:

- contact points;
- identifiers;
- addresses.

Do not model only one email and one phone as the permanent domain structure.

## Matter

`Matter` represents the law firm's internal matter/workspace.

A Matter may have:

- multiple Clients;
- multiple participants;
- multiple participant roles;
- multiple Proceedings;
- multiple linked Documents.

Do NOT implement:

```text
matter.clientId
```

as the permanent model.

## Proceeding

`Proceeding` represents a concrete formal court, administrative, arbitration, enforcement, or similar proceeding inside a Matter.

Therefore:

```text
Matter != Proceeding
```

The firm's internal Matter number is NOT the same concept as an external court/proceeding number.

A Matter can contain multiple Proceedings.

Do not assume:

```text
Matter.courtCaseNumber
Matter.court
Matter.judge
```

is sufficient as the long-term structure.

## Participant

Do not create a separate identity model such as `OppositeParty`.

Use:

```text
MatterParticipant
```

linked to Party.

Participant roles must be modeled separately so one participant can have multiple roles.

## Document

Store one physical/logical Document once.

A Document may be linked to:

- Client;
- Matter;
- Proceeding.

Do not duplicate document bytes merely because the file appears in several views.

---

# 8. Enum vs Configurable Lookup Rules

Use a code enum only when the application needs a small, finite set for program logic.

Examples of valid system enums:

```text
PartyType
MatterState
MatterPriority
DocumentSource
DocumentVisibility
CustomFieldDataType
```

Values that a law firm may reasonably customize MUST use database-backed lookup/configuration data.

Examples:

```text
PracticeArea
MatterStage
ParticipantRole
ProceedingType
DocumentCategory
OrganizationRelationshipType
```

Do NOT create a giant hard-coded case-type enum.

If a law office may reasonably say:

> We need one more option.

then it is probably NOT a code enum.

Seed sensible defaults but allow firm-specific additions without a deployment.

Referenced historical lookup values must remain readable after deactivation.

Prefer:

```text
isActive = false
```

over hard deletion for referenced lookup data.

---

# 9. Custom Field Rules

Do not attempt to predict every legal field as a core database column.

Practice-specific data belongs in typed custom fields.

Examples:

```text
Accident date
Insurance policy number
Claim value
Parcel number
Cadastral municipality
Property sheet number
```

Supported custom-field infrastructure should be typed.

Do NOT use arbitrary catch-all fields such as:

```text
matter.extraData
client.extraData
```

as a replacement for domain modeling.

A dedicated custom-field value representation may internally use JSON when appropriate, but backend validation MUST enforce the field definition's declared type.

Custom fields may be scoped by:

- entity type;
- optional PracticeArea;
- tenant/firm.

Inactive definitions/options must remain readable for existing historical values.

---

# 10. Matter Lifecycle Rules

Target system states:

```text
DRAFT
OPEN
CLOSED
```

Archiving is separate from lifecycle state.

Do not model:

```text
ARCHIVED
```

as a business state when the repository can represent archival separately.

Draft Matter creation should remain permissive enough for future:

- AI intake;
- document-driven creation;
- partially completed workflows.

V1 business rule:

- Draft requires the minimum safe data, typically title.
- Opening a Matter requires at least one Client.

The backend MUST enforce lifecycle transition rules.

---

# 11. Frontend Control Rules for the Legal Domain

Use controls according to semantics.

## Radio / segmented control

Use for small mutually exclusive choices.

Primary example:

```text
Person | Organization
```

## Text input

Use for:

- names;
- titles;
- job titles;
- external numbers;
- short labels.

## Textarea

Use for:

- descriptions;
- notes.

## System enum select

Use for small system-controlled values such as:

- priority;
- lifecycle actions when a select is appropriate.

## Searchable select

Use for configurable lookup values:

```text
PracticeArea
MatterStage
ParticipantRole
ProceedingType
DocumentCategory
OrganizationRelationshipType
```

These should support inline creation where the user has permission.

## Autocomplete

Use for potentially large entity collections:

```text
Client
Party
User
```

Do not preload thousands of records into a select.

## Multi-autocomplete

Use for Matter Clients.

## Checkbox

Use for independent boolean values such as:

- primary contact where the UX pattern enforces exclusivity correctly;
- include Matter documents;
- similar optional flags.

## Date/date-time

Use date/datetime controls rather than arbitrary text fields.

---

# 12. Inline Creation Rules

Configurable lookup selects should support contextual creation where specified.

Example:

```text
Practice area
[ Search... ]

+ Add "Banking disputes"
```

Use the project's established dialog/drawer/popover pattern.

After successful creation:

1. close the creation surface;
2. invalidate/refresh the lookup data;
3. select the newly created value.

Do not duplicate the same inline-create logic independently for every lookup if a small reusable abstraction fits the current frontend architecture.

Avoid over-generalized abstractions that make ordinary form code difficult to understand.

---

# 13. Search Requirements

Client search is not limited to the Client's own primary fields.

The target system must be able to find an organization Client through its contact persons.

Example:

```text
Search: jelena@abc.rs
```

should be able to return:

```text
ABC DOO
```

when Jelena is related to ABC DOO through PartyRelationship.

Client search should eventually support:

- display name;
- client code;
- direct Party contact point;
- identifier;
- organization contact-person name;
- organization contact-person email;
- organization contact-person phone.

Matter search should support at least:

- internal Matter number;
- title;
- Client display name.

Use PostgreSQL/database capabilities and proper indexes first.

Do not introduce Elasticsearch or another search engine unless:

- it already exists in the repository; or
- measured requirements justify it; and
- the user approves the architectural change.

---

# 14. Prisma & PostgreSQL Rules

Use Prisma migrations for database schema evolution according to the project's existing workflow.

Do not edit or rewrite migrations that may already have been applied.

Prefer additive, staged migration patterns.

## Constraints

Use database constraints where they represent true invariants.

Examples may include:

```text
unique tenant-scoped client code
unique tenant-scoped Matter internal number
unique Matter + Client relationship
foreign keys
not-null structural fields
```

Do not add an unsafe `NOT NULL` requirement to legacy business data before it has been migrated/backfilled.

## Indexes

Add indexes based on real query paths.

Likely indexed concepts include:

- tenant/firm ID;
- Matter internal number;
- Matter state;
- PracticeArea;
- Stage;
- responsible User;
- Client relationships;
- Party display/search fields;
- contact-point value;
- identifier value;
- Document category/date.

Do not add large numbers of speculative indexes without checking query behavior.

## Transactions

Use Prisma transactions for multi-step mutations that must succeed atomically.

Examples:

- create organization Party + Client + contact persons + PartyRelationships;
- open Matter + MatterClients where required;
- domain action + ActivityEvent where transaction semantics require consistency.

Follow existing repository transaction conventions.

---

# 15. Database & Migration Safety

Existing Client/Case data MUST be preserved.

Do not perform a destructive "replace everything" migration.

Prefer an expand-and-contract sequence:

1. add new structures;
2. migrate/backfill existing data;
3. introduce new runtime read/write paths;
4. verify parity;
5. switch runtime usage;
6. keep legacy data temporarily where rollback may be needed;
7. remove verified-unused runtime compatibility code later;
8. never delete historical migration files.

Do not invent placeholder business data such as:

```text
UNKNOWN
N/A
TEMP
MIGRATED
```

simply to satisfy a schema constraint.

If existing data cannot satisfy a future rule:

- keep migration-stage schema nullable when necessary;
- enforce stricter validation for new workflows;
- backfill real data;
- tighten constraints only when safe.

Every important data migration must include verification.

Examples:

- source vs target counts;
- orphan checks;
- duplicate checks;
- tenant consistency;
- representative mapping samples.

---

# 16. Multi-Tenancy Rules

All firm-owned business data MUST be tenant scoped.

Never trust a tenant identifier sent by the browser as the authority.

Do NOT use request body fields such as:

```text
firmId
tenantId
organizationId
```

to establish ownership.

Resolve tenant/firm context from authenticated backend context using the existing project architecture.

All new queries, mutations, autocomplete endpoints, lookup endpoints, custom-field operations, document links, and relationship operations must respect tenant scope.

---

# 17. Authorization & IDOR Prevention

Every referenced ID received from the browser is untrusted.

The backend MUST verify that referenced objects:

1. exist;
2. belong to the correct tenant;
3. are accessible to the current user;
4. are valid for the requested relationship.

This applies to:

- Client IDs;
- Party IDs;
- User IDs;
- PracticeArea IDs;
- Stage IDs;
- ParticipantRole IDs;
- ProceedingType IDs;
- DocumentCategory IDs;
- relationship type IDs;
- Document IDs;
- custom-field definitions/options/references.

Do not:

```text
findById(id)
then trust tenant ownership
```

when the repository can query directly inside the authenticated tenant scope.

Autocomplete/search endpoints are security-sensitive and MUST NOT leak cross-tenant names, emails, phone numbers, matter titles, identifiers, or documents.

---

# 18. Document Security

A Document belonging to one tenant must never be:

- fetched by another tenant;
- linked to another tenant's Matter;
- linked to another tenant's Client;
- linked to another tenant's Proceeding.

Document authorization must be enforced on the backend even if the UI hides unauthorized actions.

Reuse the repository's existing file storage provider and access pattern unless an explicit architectural change is approved.

---

# 19. Activity & Audit Rules

Meaningful business actions should produce backend-generated Activity events.

The frontend MUST NOT be the authoritative creator of audit history.

Examples:

```text
CLIENT_CREATED
CLIENT_UPDATED

MATTER_CREATED
MATTER_UPDATED
MATTER_STATE_CHANGED

MATTER_CLIENT_ADDED
MATTER_CLIENT_REMOVED

PARTICIPANT_ADDED
PARTICIPANT_REMOVED

PROCEEDING_CREATED
PROCEEDING_UPDATED

DOCUMENT_UPLOADED
DOCUMENT_LINKED
```

Keep event payloads minimal and structured.

Do not store unnecessary copies of sensitive personal identifiers in activity payloads.

Important mutable entities should also retain normal audit metadata such as:

```text
createdAt
createdBy
updatedAt
updatedBy
```

according to repository conventions.

---

# 20. API Design Rules

Follow existing NestJS controller/service/module patterns.

Do not expose raw Prisma objects as public contracts.

Use shared API contracts where types are used by both backend and frontend.

Use small DTOs for:

- autocomplete;
- list rows;
- lookup options.

Do not return large nested ORM graphs merely because relations are available.

Potentially large lists MUST use the project's existing pagination pattern.

Do not create a second pagination style.

Backend validation remains authoritative for:

- state transitions;
- tenant ownership;
- required relationships;
- custom-field type validation;
- document links;
- lookup ownership;
- participant/client relationships.

---

# 21. Copilot Plan-Mode Workflow

For the numbered implementation phases under:

```text
.github/prompts/
```

Copilot MUST work in Plan mode first.

Before planning:

1. Read this file.
2. Read the relevant files under `docs/legal-domain/`.
3. Read the previous delivery artifacts specified by the prompt.
4. Inspect the relevant source code.
5. Inspect Prisma schema and relevant migrations.
6. Inspect shared contracts under `libs/api/api-interfaces/src/lib/`.
7. Inspect existing NestJS patterns.
8. Inspect existing Angular patterns.
9. Inspect relevant tests.
10. Inspect the Spartan/UI skill when frontend UI is involved.

Do not ask the user to explain repository facts that can be discovered directly.

Ask the user when information is genuinely required and cannot safely be inferred.

If there are no blocking questions, explicitly state:

```text
No blocking questions.
```

## Plan output must include

- relevant repository findings;
- scope;
- explicit non-scope;
- files/modules expected to change;
- shared contract impact;
- Prisma schema/migration impact;
- NestJS/API impact;
- Angular/UI impact;
- migration/data compatibility risk;
- tenant/security implications;
- testing strategy;
- verification commands;
- questions/decisions requiring approval.

Do not modify application code until the plan is approved.

---

# 22. Delivery Tracking

Every numbered implementation phase MUST create and maintain a matching directory:

```text
delivery/NN-phase-name/
```

Required files:

```text
plan.md
changes.md
decisions.md
verification.md
open-questions.md
```

## `plan.md`

Record:

- objective;
- repository findings;
- scope/non-scope;
- blocking questions;
- planned file changes;
- Prisma/migration plan;
- API/shared-contract plan;
- frontend plan;
- risks;
- verification plan;
- rollback/data-safety notes.

## `changes.md`

Record actual work completed.

Group when relevant by:

- Prisma/database;
- NestJS backend;
- shared contracts;
- Angular frontend;
- tests;
- documentation.

Record deviations from the approved plan.

## `decisions.md`

Record durable architecture/product decisions.

For significant decisions include:

- decision;
- reason;
- alternatives considered;
- consequences.

## `verification.md`

Record only checks that were actually run.

Examples:

```text
nx test ...
nx lint ...
nx build ...
prisma validation
migration verification query
API test
manual UI flow
```

Never claim a command/check passed if it was not run.

Clearly distinguish:

- passed;
- failed because of this phase;
- known pre-existing failure;
- not run.

## `open-questions.md`

Record:

- unresolved questions;
- deferred work;
- known limitations;
- follow-up items.

If nothing is unresolved, write:

```text
None.
```

## Plan-mode limitation

If Plan mode cannot write repository files, Copilot must include the proposed `plan.md` content in its response and create/update the delivery files as soon as execution begins.

---

# 23. Testing & Verification

Each phase must add or update tests for the important behavior it introduces.

Use the repository's established test frameworks.

Relevant categories may include:

- unit tests;
- NestJS integration/API tests;
- database/repository tests;
- Angular component tests;
- end-to-end tests if already part of the project.

Security-sensitive phases require negative tests.

Examples:

- tenant A cannot attach tenant B Client to a Matter;
- tenant A cannot search tenant B contact;
- tenant A cannot link tenant B Document;
- invalid lookup IDs are rejected;
- invalid custom-field reference IDs are rejected.

Run relevant repository-standard checks before marking a phase complete.

Do not fix unrelated pre-existing failures unless explicitly requested.

Record unrelated failures in `verification.md`.

---

# 24. Scope Control

Complete only the requested numbered phase.

Do not opportunistically refactor unrelated code.

Small prerequisites are acceptable when essential.

If a prerequisite materially increases scope:

1. identify it in Plan mode;
2. explain why it is necessary;
3. ask for approval before expanding the phase.

Do not silently turn a scoped phase into a repository-wide rewrite.

---

# 25. Legacy Cleanup Rules

Legacy code may be removed only after:

- new data has been migrated;
- verification has passed;
- new runtime paths are authoritative;
- no required compatibility path still references the old structure.

Do not delete historical database migration files.

Do not drop legacy database columns/tables merely because frontend code no longer references them if rollback/data verification is incomplete.

Use repository search, tests, and migration evidence before removing old code.

---

# 26. AI Readiness Principles

The domain model must remain useful independently of AI.

AI functionality should consume structured legal context instead of dictating the persistence model.

Future AI context may combine:

```text
Matter
Clients
Parties
organization contact persons
participants and roles
Proceedings
Documents
extracted document text
Activity
Tasks
Deadlines
Email
```

Do not put all AI-related information into one unstructured Matter JSON field.

Do not couple core domain writes to a specific AI provider unless an explicitly approved feature requires it.

---

# 27. Required Reading by Task Type

## Client / Party work

Read:

```text
docs/legal-domain/03-party-client.md
docs/legal-domain/07-frontend-ux.md
docs/legal-domain/08-api-search.md
docs/legal-domain/09-security-tenancy.md
```

as applicable.

## Matter / Proceeding work

Read:

```text
docs/legal-domain/04-matter-proceeding.md
docs/legal-domain/07-frontend-ux.md
docs/legal-domain/08-api-search.md
docs/legal-domain/09-security-tenancy.md
```

## Document work

Read:

```text
docs/legal-domain/05-documents.md
docs/legal-domain/09-security-tenancy.md
```

## Lookup / custom field work

Read:

```text
docs/legal-domain/06-lookups-custom-fields.md
docs/legal-domain/09-security-tenancy.md
```

## Migration work

Read:

```text
docs/legal-domain/10-migration-data-safety.md
```

## Activity work

Read:

```text
docs/legal-domain/11-activity-audit.md
```

## UI work

Also read:

```text
.github/skills/spartan-ui/SKILL.md
```

---

# 28. Definition of Successful Architecture

The core Client/Matter model should NOT require redesign simply because the application later needs:

- a new PracticeArea;
- a new MatterStage;
- a new participant role;
- a new document category;
- a new organization relationship type;
- a new custom field;
- a second Client on one Matter;
- a second Proceeding;
- another contact person for an organization;
- tasks;
- deadlines;
- calendar events;
- time entries;
- expenses;
- invoices;
- email integration;
- AI features.

If such a change requires a core schema redesign, first reconsider whether the concept should be modeled as:

- a relation;
- configurable lookup;
- custom field;
- separate domain entity.

---

# 29. Final Rule

Before implementing a legal-domain feature:

```text
understand existing code
→ read the domain specification
→ inspect shared contracts
→ inspect Prisma schema/migrations
→ inspect NestJS patterns
→ inspect Angular patterns
→ inspect Spartan/UI skill when relevant
→ plan
→ ask blocking questions
→ obtain approval
→ implement
→ test
→ verify
→ update delivery documentation
```

Do not skip directly from feature request to code generation.
