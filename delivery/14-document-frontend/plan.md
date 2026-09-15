# Phase 14 — Document frontend

## Overview

This phase adds the user-facing document experience for the new one-document-many-links model. The implementation should align with the repository’s current Angular patterns, the existing lookup API, and the backend document-link model without introducing a separate UI architecture or duplicated storage semantics.

No blocking questions.

## Repository findings relevant to this phase

- The repo already has a stub route and placeholder component at [apps/web/src/app/features/documents/documents.component.ts](../../apps/web/src/app/features/documents/documents.component.ts) and [apps/web/src/app/features/documents/documents.component.html](../../apps/web/src/app/features/documents/documents.component.html). This is an empty placeholder rather than a working document feature.
- The closest existing detail patterns are the Client detail screen in [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts) and the case detail screen in [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts). Both use tabs, `signal()`-based state, backend calls, confirm dialogs, and localized toast flows.
- The repo already has searchables/selects and inline-create lookup support patterns through the references API; this is documented in [delivery/10-inline-create-lookups/changes.md](../10-inline-create-lookups/changes.md).
- The document backend plan was recorded in [delivery/13-document-backend/changes.md](../13-document-backend/changes.md), and the legal-domain UX requirements are in [docs/legal-domain/05-documents (1).md](<../../docs/legal-domain/05-documents%20(1).md>) and [docs/legal-domain/07-frontend-ux (1).md](<../../docs/legal-domain/07-frontend-ux%20(1).md>).
- The repo has no live document domain UI yet, so this phase is genuinely a frontend feature build, not a refactor of an existing document screen.

## Scope

### In scope

- Implement the Matter Documents tab/section with upload, search, category filter, document list, and intended actions.
- Implement the Client Documents tab/section with direct-document view and a toggle to include documents from the Client’s Matters.
- Deduplicate aggregated rows by document identity.
- Add the upload form with file, optional title, category searchable select with inline creation, optional document date, optional description, and visibility.
- Use the existing upload progress/error patterns already used elsewhere in the app.
- Respect authorization-sensitive UI behavior without assuming that hiding actions is a security control.
- Add tests for aggregation/deduplication and core form behavior.

### Out of scope

- Building a separate document storage provider or refactoring unrelated feature modules.
- Implementing OCR, extraction, or AI-powered document processing beyond the current repository scope.
- Broad redesign of the legal domain outside the document surfaces.
- Changing backend security rules in this frontend phase beyond what the repo’s API contract requires.

## Expected files and modules to change

Likely affected files:

- [apps/web/src/app/features/documents/documents.component.ts](../../apps/web/src/app/features/documents/documents.component.ts)
- [apps/web/src/app/features/documents/documents.component.html](../../apps/web/src/app/features/documents/documents.component.html)
- [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts)
- [apps/web/src/app/features/clients/client-detail.component.html](../../apps/web/src/app/features/clients/client-detail.component.html)
- [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts)
- [apps/web/src/app/features/cases/case-detail.component.html](../../apps/web/src/app/features/cases/case-detail.component.html)
- existing shared UI components for forms, tables, dialogs, upload, and selects under [apps/web/src/app/shared](../../apps/web/src/app/shared)
- API client contract stubs under the generated/shared client libs if the backend contract adds document routes

## Database and migration impact

- This phase is frontend-focused and should not introduce schema changes by itself.
- It should rely on the backend document-link model created in Phase 13 and should not assume duplicate file rows are acceptable.
- If the frontend reveals a schema or API gap, the issue should be surfaced as a blocking decision rather than silently inventing a parallel contract.

## API and contract impact

Expected API behavior to align with the frontend:

- document upload result includes the stored record metadata;
- document links can be listed per `Client` and per `Matter`;
- aggregated client documents should be deduplicated by document ID even when multiple matter links match;
- list endpoints should support search, category filter, and pagination consistent with the repo’s pattern;
- upload form should post to the repository’s existing upload call/route format and use the standard error / toast flow.

This phase should not invent a different API contract than the backend document service uses.

## Frontend impact

### Matter documents experience

- Upload action in the Matter detail/workspace or documents section.
- List of documents for the matter.
- Search and category filter.
- Document metadata fields shown in a compact table/list.
- Actions consistent with current detail-screen conventions.

### Client documents experience

- Default list shows only documents directly linked to the client.
- Optional checkbox: `Include documents from this client's matters`.
- Aggregate results by `Document` identity; do not duplicate rows when the same document is associated with both the client and a matter.

### Upload form

- file input (required)
- title (optional)
- category searchable select with inline creation
- document date (optional)
- description (optional)
- visibility select
- progress/error handling consistent with repository patterns

## Compatibility and data-safety risks

- The key risk is mismatch between frontend expectations and the backend document-link model, especially if list/aggregate semantics are implemented before the backend API exists.
- The UI must not hide security issues behind client-side filtering; it should simply respect the backend contract and authorization context.
- Duplicate document rows are a UX bug and a data-integrity bug if multiple links are flattened incorrectly; deduplication must be by document identity, not by filename or upload date.

## Test and verification strategy

Add or update targeted tests for:

1. client document aggregation deduplicates repeated document rows from multiple matter links;
2. direct-only client documents are the default selection when the include-matter toggle is off;
3. document upload form validation and category fallback behavior;
4. searchable select / inline-create UX wiring, if the form uses the repository’s current references flow.

Verification after implementation:

- run the most relevant frontend/Jest tests for the client and document feature modules;
- run targeted compile or build validation if the form uses new shared UI components or API client methods;
- record the exact command and result in [delivery/14-document-frontend/verification.md](./verification.md).

## Decisions requiring approval

- Use the existing repo-native UI patterns for tabs, forms, toasts, and confirm dialogs rather than introducing a new component architecture.
- Keep the client documents view as direct-by-default with an explicit include-matter toggle, matching the legal-domain UX rule rather than a more complex default aggregation.
- Do not implement duplicate-file semantics in the frontend; the UI should reflect the one-document-many-links domain model only.

## Completion gate

This phase is complete when users can understand and manage document relationships without creating duplicate files or confusing the same stored document as multiple separate uploads.
