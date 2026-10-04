# Invoice Domain Rename Specification

## Context

The implemented finance workflow represents invoices, but its persistence models and application contracts still call them billing statements. The mixed vocabulary leaks into Prisma, API types and routes, Angular symbols, filenames, and localization keys.

## Requirements

- Rename the persisted domain models and enums to `Invoice`, `InvoiceLine`, and `InvoiceLineCase` without losing existing data.
- Rename related fields, relations, Prisma client accessors, shared API contracts, DTOs, service methods, and seed helpers to invoice terminology.
- Expose invoice-oriented financial API routes and client methods without retaining billing-statement aliases.
- Rename Angular finance feature symbols, files, routes, variables, helpers, tests, and localization keys to invoice terminology.
- Preserve current authorization, lifecycle, totals, import, edit, delete, send, void, detail, and print behavior.
- Update implemented-business documentation to describe the invoice domain accurately.

## Out of scope

- Changes to invoice calculations, lifecycle rules, permissions, or visual design.
- Rewriting historical migrations or completed delivery-track records.
- Renaming the broader billing-entry/work-review concepts, which remain distinct from issued invoices.

## Acceptance criteria

- No active application, schema, seed, or test code refers to `BillingStatement`, `BillingStatementLine`, or billing-statement localization keys.
- A data-preserving migration renames the existing database objects and their relevant columns, constraints, and indexes.
- Generated Prisma types, targeted backend tests, targeted frontend tests, and affected builds/type checks pass.
- Existing invoice screens display the same localized user-facing wording through invoice-named keys.
