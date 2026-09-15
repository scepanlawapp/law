# Changes

## Security/runtime fixes

- Replaced the duplicate `@law/documents` path collision with `@law/legal-documents` for the legal DocumentsModule.
- Added the missing Document query sort contract.
- Added resolved-path containment to LegalDocumentStorage to block `../` traversal.
- Added `apps/api/src/app/documents.storage.spec.ts` regression coverage.
- Corrected Angular detail-tab selection typing.

## Cleanup decisions

- Retained legacy Case/Client contracts and API clients because current dashboard/sidebar/routes still use `/cases` and legacy wrappers remain compatibility surfaces.
- Retained historical Prisma migrations and existing chat storage paths.

## Deferred

- Custom-field APIs and validation.
- Participant/proceeding mutations.
- Full Document link/unlink and frontend integrations.
- Authenticated cross-tenant e2e suite.
