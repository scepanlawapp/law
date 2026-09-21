# Document upload modal decisions

## Confirmed from code

- Create and add-version both return `DocumentDetail` (`DocumentsService.addVersion` calls `get()`). The earlier prompt’s `DocumentVersionSummary` return type is not the live contract.
- Category, description, and document date are not on the API. The Category column is a disabled placeholder. No invented multipart fields.
- Idempotency fingerprint includes purpose, title, caseIds, clientIds, originalFilename (and documentId for versions). Retry of a failed ingest **must** reuse the same key and payload. Changing title after a reserved key requires a **new** key (implemented as: failed rows retry frozen payload only; user removes and re-adds to correct).
- Client-side MIME/extension checks are advisory. Title (required, max 320) and size (`UPLOAD_MAX_BYTES` fallback 25_000_000) block upload. Backend magic-byte validation is authoritative.
- `FILE_STORAGE_ROOT` / max bytes are not in `config.json`. Fallback constant `DOCUMENT_UPLOAD_MAX_BYTES = 25_000_000` must match API `UPLOAD_MAX_BYTES`.
- Angular 22 Fetch backend throws if `reportProgress` is used for uploads. App-wide `withXhr()` keeps interceptors and enables `HttpEventType.UploadProgress`. Chat still uses `HttpClient` for JSON/FormData and EventSource for SSE — not affected.
- CSRF is origin-based (`CsrfOriginGuard`), not an XSRF header. Session cookie via `authInterceptor` `withCredentials`.
- Case detail had no documents tab; a thin placeholder + upload button is added so the modal has a case entry point without a document library.
- No existing route `CanDeactivate` guard. Dialog uses confirm-on-cancel for unsent rows and `beforeunload` while requests are in flight.

## API gap (backend follow-up)

Optional `category` (and later description/date) on create/update. Until then the UI must not persist categories locally.
