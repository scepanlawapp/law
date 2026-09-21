# Document and File Storage Backend Specification

## Scope

Add a NestJS document and file-storage backend for the single PostgreSQL workspace. PostgreSQL stores metadata and locations. File bytes live in a persistent local directory outside source and public assets. Identity, versions, and case/client links must survive later storage-provider changes.

AI is not required. Chat attachments and DOCX exports stay on their existing paths.

## What

- Document records with optional many-to-many case and client links, immutable versions, archive/restore, and activity-log entries.
- Reusable file service: generated keys, streaming uploads, SHA-256, MIME inspection, upload-operation state, idempotency, bounded cleanup.
- Storage router that persists a connection on each upload and uses that recorded connection on read. First adapter: local disk only.
- Authenticated APIs for create (with file), list/search, detail, metadata/link updates, version upload/list, current and historical download, archive, and restore.

## Why

The documents UI is a placeholder. Client identification documents are metadata only. Chat uploads buffer entire files in memory and are not a document DMS. Offices need versioned case/client files whose identity is independent of the storage destination.

## Non-goals

- Angular screens or styling
- Cloud, SFTP, or office-server adapters
- Discovery, external-folder sync, or migration tooling
- OCR, AI indexing, physical deduplication, or permanent deletion
- Moving or rewriting chat attachments or DOCX export storage
- Tenant databases or `X-Workspace-Id` revival
- Claiming files were malware-scanned

## Decisions

- One database, hardcoded workspace isolation, `WorkspaceAccessGuard`.
- Any active workspace member may mutate (same as clients/cases/chat).
- Documents may link to many cases and many clients.
- Archive hides from default lists; detail, versions, and downloads remain authorized.
- `Idempotency-Key` is required on upload POSTs.
- Default MIME allowlist and `UPLOAD_MAX_BYTES` match chat.
- Library aliases: `@law/file-storage` and `@law/workspace-documents` (do not collide with `@law/documents` DOCX renderer).
