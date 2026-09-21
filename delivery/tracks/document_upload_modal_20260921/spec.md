# Document upload modal specification

## Scope

Reusable Angular 22 upload modal for workspace documents, launched from the Documents empty state, Client → Documents tab, and a thin Case → Documents tab (no full document library).

Create mode: one HTTP request per selected file (`POST /api/documents`). Optional case/client links use existing list APIs. Originating case/client from those pages is locked.

Version mode is supported by the same queue/transport for a future explicit entry point: one file, locked document id, `POST /api/documents/:id/versions`. No filename matching.

## Out of scope

- Document list, archive/restore, metadata PATCH, downloads
- Category / description / document-date persistence
- Chat attachment migration
- Cancel-as-rollback, resumable uploads after reload
- Cloud storage

## Behavior

- Multipart field `file`, metadata fields before the file, repeated `caseIds` / `clientIds` (not JSON/CSV)
- Required `Idempotency-Key` (UUID, one per logical row, reused on retry)
- Bounded concurrency (2)
- Real `HttpClient` upload progress (`observe: 'events'`, `reportProgress: true`) over XHR (`withXhr()`)
- Per-row errors; partial success returned on close
- Category column disabled: “Category is not available yet.”
