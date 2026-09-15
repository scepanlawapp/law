# Phase 13 — Document backend and domain links

## Overview

This phase introduces the additive document domain required by the legal model: a single physical document stored once and linked to a Client, Matter, and/or Proceeding without duplicate file storage. The work must stay compatible with the repository’s current multi-tenant architecture and the current storage conventions instead of introducing a separate parallel document stack.

No blocking questions.

## Repository findings relevant to this phase

- The current tenant schema in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) includes `DocumentCategory` and the domain lookups for `Matter`, `MatterParticipant`, and `Proceeding`, but it does not yet include a generic `Document` model or `ClientDocument` / `MatterDocument` / `ProceedingDocument` link tables.
- The repo’s current storage implementation is local filesystem-based and tenant-scoped for chat uploads via [libs/api/features/chat/src/lib/chat.storage.ts](../../libs/api/features/chat/src/lib/chat.storage.ts) and [libs/api/features/chat/src/lib/chat.config.ts](../../libs/api/features/chat/src/lib/chat.config.ts). This is the existing pattern to reuse unless a stronger repository-defined document storage exists.
- The configured lookup API already includes `documentCategory` and the repository pattern is in [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts) and [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts).
- The legal-domain mandate for document linking and tenant isolation is in [docs/legal-domain/05-documents (1).md](<../../docs/legal-domain/05-documents%20(1).md>), [docs/legal-domain/08-api-search (1).md](<../../docs/legal-domain/08-api-search%20(1).md>), and [docs/legal-domain/09-security-tenancy (1).md](<../../docs/legal-domain/09-security-tenancy%20(1).md>).
- The migration and historical risk analysis for the domain is recorded in [delivery/04-legacy-data-migration/verification.md](../04-legacy-data-migration/verification.md) and [delivery/06-matter-api/changes.md](../06-matter-api/changes.md).

## Scope

### In scope

- Add the missing document domain tables and relationship links in the tenant schema.
- Reuse the existing storage/provider approach and upload mechanism unless the repository already has a stronger document-provider pattern.
- Add metadata fields for the document model such as title, category, date, source, visibility, uploader, description, size, mime, checksum, and archive semantics.
- Add the required API/service operations for upload, link, unlink, list, and metadata update.
- Enforce tenant scope and ownership on every document link operation.
- Add tests focused on cross-tenant prevention and document linkage correctness.

### Out of scope

- Broad rewrite of the client/case domain or unrelated modules.
- Replacing the repository’s existing storage abstraction with an entirely new provider unless a verified repository contract requires it.
- Adding a search engine or parallel indexing architecture when the repo’s existing database patterns are sufficient.
- Destructive migration or removal of legacy storage until the compatibility path is proven.

## Expected files and modules to change

Likely affected areas:

- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [apps/api/prisma/tenant-migrations](../../apps/api/prisma/tenant-migrations)
- [libs/api/features/references/src/lib/references.service.ts](../../libs/api/features/references/src/lib/references.service.ts)
- [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts)
- new or existing document feature module under [libs/api/features](../../libs/api/features)
- API controller/service patterns mirroring the current feature modules (clients, cases, matters, references)
- relevant validation and DTO files under the same feature module
- tenant-local storage logic if the upload path must be generalized from chat attachments to shared documents

## Database and migration impact

- This must be an additive migration: new document and link tables, then compatibility reads/writes.
- Preserve existing `Client`, `Matter`, `Proceeding`, and lookup data.
- Do not remove legacy chat attachment storage until a safe compatibility path is verified.
- The schema should explicitly support a single stored physical document with multiple link records rather than duplicate file rows.
- Add verification queries to ensure tenant scoping, uniqueness, and no duplicate storage keys within the same workspace.

## API and contract impact

Expected contract shape:

- `Document` records should capture stored metadata and linkability.
- `ClientDocument`, `MatterDocument`, and `ProceedingDocument` relations should be tracked as separate link tables or repository-equivalent entities.
- The API should expose operations for create/upload, link, unlink, list, metadata update, and tenant-safe access checks.
- Every incoming `clientId`, `matterId`, `proceedingId`, or `documentId` must be validated against the current tenant and authorization context.

This should follow the repository’s current NestJS + Prisma conventions rather than introducing a new API style.

## Frontend impact

When the frontend consumes this phase:

- the upload UI should use the existing design system and searchable selects for document categories;
- the document list should support a single stored document appearing under multiple domain views without duplicate rows;
- client and matter detail pages should treat document aggregation as link-based, not duplicate-file based;
- a `Client` document view may optionally include matter-linked documents with a filter toggle, but only after the backend contract is in place.

## Compatibility and data-safety risks

- The repo currently has no generic document model, so a new document layer is a true additive domain introduction rather than a small refactor.
- Local filesystem storage has tenant boundaries in the path (`tenants/<workspaceId>/...`), which is positive but must be maintained for all document uploads and reads.
- Cross-tenant link prevention must be tested as a core negative scenario rather than assumed.
- Document metadata and links need explicit historical handling for archived/deactivated records, but not via destructive deletes.

## Test and verification strategy

Targeted tests to add or extend:

1. document upload creates a metadata row and stores the file once;
2. linking a document to multiple domain entities does not duplicate the stored file;
3. cross-tenant link rejection when a document from workspace A is linked to workspace B’s Matter or Proceeding;
4. tenant-scoped document listing and access checks;
5. duplicate link prevention for repeated `ClientDocument` / `MatterDocument` / `ProceedingDocument` entries;
6. validation of document category lookup ownership and activation state.

Verification execution after implementation:

- run the most relevant API/Jest tests for the document and references modules;
- run targeted type-check/build checks if the document service introduces new DTOs or shared contracts;
- record exact commands and results in [delivery/13-document-backend/verification.md](./verification.md).

## Decisions requiring approval

- Reuse the repo’s current storage and upload conventions rather than introducing an entirely new storage provider.
- Keep the new document domain additive and compatibility-first instead of forcing a destructive migration of chat attachments or legacy storage.
- Treat `DocumentCategory` as tenant-scoped lookup data, not a hard-coded enum.

## Completion gate

This phase is complete when a single stored document can be safely linked to a Client, Matter, and/or Proceeding without file duplication, while preserving tenant isolation, authorization, and existing repository conventions.
