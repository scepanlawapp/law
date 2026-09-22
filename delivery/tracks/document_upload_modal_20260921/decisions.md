# Document upload modal decisions

## Confirmed from code

- Create and add-version both return `DocumentDetail` (`DocumentsService.addVersion` calls `get()`). The earlier prompt’s `DocumentVersionSummary` return type is not the live contract.
- Description and document date are still not on the API. Category is now an optional nullable string on `Document` (stable codes, not a Prisma enum).
- Idempotency fingerprint includes purpose, title, category, caseIds, clientIds, originalFilename (and documentId for versions). Retry of a failed ingest **must** reuse the same key and payload. Changing title/category after a reserved key requires a **new** key (implemented as: failed rows retry frozen payload only; user removes and re-adds to correct).
- Client-side MIME/extension checks are advisory. Title (required, max 320) and size (`UPLOAD_MAX_BYTES` fallback 25_000_000) block upload. Backend magic-byte validation is authoritative.
- `FILE_STORAGE_ROOT` / max bytes are not in `config.json`. Fallback constant `DOCUMENT_UPLOAD_MAX_BYTES = 25_000_000` must match API `UPLOAD_MAX_BYTES`.
- Angular 22 Fetch backend throws if `reportProgress` is used for uploads. App-wide `withXhr()` keeps interceptors and enables `HttpEventType.UploadProgress`. Chat still uses `HttpClient` for JSON/FormData and EventSource for SSE — not affected.
- CSRF is origin-based (`CsrfOriginGuard`), not an XSRF header. Session cookie via `authInterceptor` `withCredentials`.
- Case detail had no documents tab; a thin placeholder + upload button is added so the modal has a case entry point without a document library.
- No existing route `CanDeactivate` guard. Dialog uses confirm-on-cancel for unsent rows and `beforeunload` while requests are in flight.

## Category

- No previous category column or taxonomy in the database. Additive `category TEXT` on `Document`. Existing rows stay null (Unclassified). `OTHER` is an explicit user choice.
- New assignments must be a known code. Unexpected historical values (none expected at migration time) are preserved and shown as “Unknown category”.
- Version upload does not send or mutate category.
- GET list supports `category` exact code and `uncategorized=true`; both together is 400.

## Client-first associations

- `GET /cases` gains repeated `clientIds` (ANY-of, workspace-scoped). Single `clientId` remains.
- General dialog: Clients before Cases. Changing clients clears cases immediately. No clients disables Cases.
- Locked case context does not clear the case on client-reset. Case page does not auto-add the case client as a document `clientIds` link.
- Batch associations lock once any upload in the dialog session starts.
