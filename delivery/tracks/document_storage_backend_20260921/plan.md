# Document and File Storage Backend Plan

Repository-grounded implementation plan. Update this file and [progress.md](progress.md) after each completed step with actual test results, not predictions.

## Scope

Backend only: shared contracts, Prisma metadata, local file bytes, document APIs, recovery/cleanup, focused tests.

## Findings

See the planning session notes. Important facts:

- No Document/StoredFile models exist. `ClientIdentificationDocument` is identity metadata only.
- `@law/documents` is the DOCX renderer — use `@law/file-storage` and `@law/workspace-documents`.
- Auth: `CsrfOriginGuard` + `AuthGuard` + `WorkspaceAccessGuard` + `@WorkspaceAccess()`.
- Activity logs: `ActivityLog` via work-tracking `log(tx)`, not chat `AuditEvent`.
- Chat uses Multer `memoryStorage` and `tmp/chat-uploads/...`. Do not copy that pattern or move those files.
- API runs on the host; Compose is Postgres + Redis only.
- Feature tests live under `apps/api/src/app`.

## Architecture

API → DocumentsService → FileService → StorageRouter → LocalStorageAdapter → disk.

## Ordered work

- [x] DS-00 Delivery track artifacts and `delivery/index.md` link.
- [x] DS-01 Prisma models, constraints, additive migration.
- [x] DS-02 Auto-provision LOCAL default `StorageConnection` (migration + seeds).
- [x] DS-03 `FILE_STORAGE_ROOT` + `LocalStorageAdapter` (containment, exclusive finalize).
- [x] DS-04 Storage router (LOCAL only; reject others).
- [x] DS-05 File service (stream, checksum, MIME, idempotency, reconciliation).
- [x] DS-06 Shared contracts in `api-interfaces` (+ optional API client, no screens).
- [x] DS-07 Documents module/controller/DTOs with streaming multipart.
- [x] DS-08 Wire `AppModule` and tsconfig aliases.
- [x] DS-09 Activity log and many-to-many case/client validation.
- [x] DS-10 Env/config/README/business-logic (after behavior exists).
- [x] DS-11 Leave chat storage untouched; document the split.
- [x] DS-12 Backup/restore operator notes (volume ≠ backup).
- [x] DS-13 Focused tests with isolated temp directories.
- [x] DS-14 Update `.github/bussiness-logic-done-so-far.md` only after APIs work.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
