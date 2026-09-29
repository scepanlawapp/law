# Direct Statement Source Billing Specification

## Problem

The current finance workflow records reviewed work as standalone statement lines, then imports those lines into a statement later. This creates an unnecessary intermediate lifecycle and allows statement lines without a statement.

## Included

- Remove billing suggestion review/candidate persistence and the standalone billing-entry dialog workflow.
- Make every billing statement line belong to a statement.
- Link eligible task, event, and deadline sources directly to their billing statement through nullable `statementId` fields.
- Treat completed tasks, completed events, and satisfied deadlines with one resolvable client and no statement link as billable work.
- Use the current user as the performer for imported work, including events with multiple assignees.
- Make Work Review list billable work directly and navigate one or many same-client selections into a prefilled new-statement composer.
- Replace the statement import dialog's standalone-line query with direct work-source import, filtered by client, case, and source type.
- Create or replace statement lines and source links atomically when a draft statement is saved.
- Keep manual statement lines supported.
- When a draft statement is deleted, delete its lines and release all linked sources for billing again.
- Preserve draft-only statement deletion.
- Update shared contracts, API clients, Prisma migration/seed data, focused tests, localization, and implemented-business documentation.

## Excluded

- Changing task/event/deadline workflow statuses when billing them.
- Deleting sent or voided statements.
- Tax, tariff, discount, exchange-rate, payment, or document-export changes.
- Retaining dismissed candidate history after the candidate model is removed.
