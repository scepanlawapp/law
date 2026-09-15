# Decisions

## Local zero-legacy baseline

The local platform registry and tenant database were inspected before schema work. The active tenant contained no legacy legal tables. Phase 01 therefore applies a schema-only additive migration locally and records zero legacy rows rather than inventing migration data.

## Tenant-local legal data

All legal entities are stored in the tenant Prisma schema. Platform user IDs and workspace IDs remain scalar values because the platform and tenant data live in separate physical databases.

## Configurable lookup records

PracticeArea, MatterStage, ParticipantRole, ProceedingType, DocumentCategory, and OrganizationRelationshipType are models with tenant/workspace-scoped codes and deactivation fields, not code enums.

## Matter lifecycle

Matter uses DRAFT, OPEN, and CLOSED state. Archival remains separate through `archivedAt`. Client relationships are represented by MatterClient, not a single Matter client ID.

## Migration strategy

The new migration is additive and timestamped. The empty historical `20260913000000_clients_cases` directory was not rewritten. Existing chat and audit tables remain intact.

## Matter numbering

The schema adds `MatterNumberCounter` and a unique `(workspaceId, internalNumber)` constraint. Allocation and final display-format policy remain API-layer work and must be implemented transactionally.
