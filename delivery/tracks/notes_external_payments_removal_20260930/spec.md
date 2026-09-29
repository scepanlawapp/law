# Notes and External Payments Removal Specification

## Problem

The platform contains a standalone `Note` domain and an `ExternalPaymentRecord` model that are no longer required. Keeping their schema, APIs, clients, UI, and assistant integration adds unused concepts and maintenance cost.

## Scope

- Remove the dedicated `Note` Prisma model, enum, relations, REST endpoints, service logic, DTOs, shared contracts, API-client methods, note dialog, seed data, assistant activity integration, tests, and dedicated translations.
- Remove `ExternalPaymentRecord`, its Prisma relations, financial-service persistence and response shape, shared contracts, and related tests/documentation.
- Add a forward migration that drops both tables and the obsolete note enum.
- Preserve unrelated note-like fields such as client/contact notes, draft review notes, closing notes, and `CaseActivity` records whose type is `NOTE`.

## Acceptance criteria

- Prisma no longer exposes `Note`, `NoteType`, or `ExternalPaymentRecord`.
- No backend route or frontend client can create, read, or update dedicated notes or external payment records.
- Assistant activity reads continue using case/client journals and activity logs without the dedicated note source.
- Financial statement responses no longer expose payment records.
- Demo seeds, tests, implemented-business documentation, and generated Prisma client are consistent with the removal.
