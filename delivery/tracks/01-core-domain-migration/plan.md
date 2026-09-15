# Phase 01: Core Domain, Prisma Schema, and Legacy Data Migration

## Objective

Implement the tenant-side Party, Client, configurable lookup, Matter, participant, and Proceeding foundation with an additive migration. The inspected local tenant database contained only the existing chat/workflow tables, so this execution uses a verified local zero-legacy baseline and does not fabricate backfill records.

## Findings

- Platform registry contains one active tenant: `tenant-default` with database `law_tenant_11111111_1111_4111_a111_111111111111`.
- The tenant cluster contains `postgres` and the active tenant database.
- The active tenant initially contained only `BriefExtractionResult`, `ChatAttachment`, `ChatMessage`, `ChatSession`, `DraftResult`, `TenantAuditEvent`, `WorkflowJob`, and `WorkspaceConfig`.
- No legacy Client, Case, Matter, Party, Document, Contact, Address, Activity, Proceeding, PracticeArea, Stage, Role, or lookup tables were present.
- The source tree contains no prior legal migration SQL; `20260913000000_clients_cases` remains an empty historical artifact.

## Scope implemented

- Added tenant Prisma enums and models for Party, contact points, identifiers, addresses, organization relationships, Client, configurable lookup records, Matter number counters, Matter, MatterClient, MatterParticipant, MatterParticipantRole, and Proceeding.
- Added tenant-local indexes, foreign keys, uniqueness constraints, and a partial unique index for one primary MatterClient.
- Added an additive migration under `apps/api/prisma/tenant-migrations/20260915120000_core_legal_domain/`.
- Added reusable legal schema provisioning statements and wired them into TenantSchemaProvisioner.
- Added idempotent default lookup seeding to the existing bootstrap seed.
- Applied the migration to the inspected local tenant database.

## Explicit non-scope

- Public legal APIs, shared contract rewrite, Angular implementation, search/autocomplete, document metadata/storage/link APIs, typed custom-field values, activity timeline behavior, and legacy cleanup.
- No cross-database platform foreign keys were added.
- No production or remote tenant databases were inspected or changed.

## Risks and follow-up

- Matter number allocation service and display format remain to be implemented in the API phase; the schema provides a tenant/workspace/year counter and unique internal number constraint.
- Primary-client and cross-tenant consistency require service-level checks in the API phase in addition to database constraints.
- Provisioner and migration SQL are intentionally separate representations and require parity tests as the domain evolves.
- Local database verification does not prove the state of any remote/deployed tenant database.
