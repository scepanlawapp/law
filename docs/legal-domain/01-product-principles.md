# Product and Architecture Principles

## Goal

Build a stable foundation for a legal practice management application without trying to predict every field a law office will ever need.

The system must support a useful V1 while allowing future additions such as:

- tasks;
- deadlines;
- calendar events;
- time entries;
- expenses;
- invoices;
- email integration;
- client portal;
- document extraction;
- AI summarization and drafting;
- AI matter intake;
- global search;
- reporting.

These additions should attach to the core model rather than force a redesign of Client or Matter.

## Three layers of data

### 1. Core fields

Use core columns for concepts that are structurally stable and broadly applicable.

Examples:

- identity;
- title/name;
- tenant ownership;
- lifecycle state;
- dates;
- relationships;
- responsible user;
- audit fields.

### 2. Firm-configurable lookup data

If a law firm may reasonably add another option, use a database-backed lookup.

Examples:

- practice area;
- matter stage;
- participant role;
- proceeding type;
- document category;
- organization relationship type.

Seed useful defaults, but allow the firm to create additional values without a deployment.

### 3. Typed custom fields

Practice-specific facts that are not universal should use custom fields.

Examples:

- accident date;
- insurance policy number;
- cadastral parcel;
- property sheet number;
- claim value;
- internal contract reference;
- industry-specific identifiers.

Do not add each such concept as a new Matter or Client column.

## Enum rule

Use a program enum only when the application itself depends on the finite values for logic.

Good enum candidates:

- `PartyType`: PERSON / ORGANIZATION;
- Matter lifecycle state;
- priority;
- document source;
- document visibility;
- custom-field data type.

Bad enum candidates:

- dozens of case/matter types;
- practice areas;
- workflow stages;
- participant roles;
- document categories.

## History over deletion

Legal work requires history.

Prefer:

- archive;
- deactivate;
- soft delete where the repository already uses it;
- immutable audit events for important actions.

Do not hard-delete a lookup definition or custom-field option that historical records still reference.

## AI readiness

AI should consume a structured matter context, not an unstructured giant JSON blob.

A future AI context can combine:

- Matter metadata;
- Client and Party information;
- organization contact persons;
- participants and roles;
- Proceedings;
- Document metadata and extracted text;
- Activity timeline;
- tasks/deadlines later.

The domain model comes before the AI layer.
