# Document storage decisions

## Confirmed

- Local storage only for the first release. The router still persists and resolves connections.
- Single PostgreSQL database. No tenant databases.
- Many-to-many document–case and document–client links. Clients need not all own all linked cases.
- Any active workspace member may create, version, archive, restore, list, and download.
- Archive/restore change visibility only. Bytes stay. GET detail/version/download remain authorized.
- Chat attachments keep current IDs, paths, and download route. No silent relocation.
- Hash equality is not an idempotency key and does not merge documents.
- Adapter `delete` is for verified abandoned-upload cleanup, not a public permanent-delete API.
- `configRef` is a server-controlled key (`local-default`). Never store a client-supplied filesystem root.

## Proposed defaults (adopted for this track)

- MIME allowlist matches `CHAT_ALLOWED_MIME_TYPES`.
- Maximum size: `UPLOAD_MAX_BYTES` (default 25_000_000).
- One file per create or version request.
- Title required, max 320 characters.
- List default excludes archived documents. Query `archived=true|false|all`.
- PATCH association arrays fully replace when present; omit leaves unchanged.
- `Idempotency-Key` (UUID) required on `POST /documents` and `POST /documents/:id/versions`.
- Current version is the latest committed `versionNumber`.
- Content inspection is magic-byte allowlisting only. Do not claim virus scanning.

## Essential questions

None remaining that block implementation. Allowlist/size, required idempotency keys, and `archived=all` were adopted as above.

## Deferred

Cloud/SFTP adapters, office connectors, discovery/sync, migration tooling, OCR/AI processing, physical deduplication, permanent deletion, chat FileService adoption, Angular UI.
