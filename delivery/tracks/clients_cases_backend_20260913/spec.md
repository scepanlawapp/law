# Clients and Cases Backend Specification

## Scope

Implement tenant-scoped REST APIs, NestJS business services, Prisma models, and schema provisioning for Clients and Cases. Exclude frontend, documents, financial features, AI, court integrations, and future modules.

## Decisions

- `Case` is the canonical model and API term.
- Tags, case types, and practice areas are tenant-scoped configurable reference data with ADMIN management APIs.
- Case status changes use explicit actions: activate, put on hold, resume, close, reopen, and archive. PATCH cannot modify lifecycle fields.
- Client and case numbers are human-readable, concurrency-safe, and unique per workspace.
- Tenant records contain scalar platform user IDs validated against active workspace membership; no cross-schema user foreign keys are created.

## Core Rules

- Clients: INDIVIDUAL or ORGANIZATION; ACTIVE, INACTIVE, or ARCHIVED.
- Cases: DRAFT, ACTIVE, ON_HOLD, CLOSED, or ARCHIVED; LOW, NORMAL, HIGH, or URGENT priority.
- One primary client address, one primary active contact, and exactly one active primary case responsibility are database-backed invariants.
- Archive clients only when no draft, active, or on-hold case exists. Archive cases only after closure.
- System activities are created transactionally for significant changes. Manual activities alone are editable.
