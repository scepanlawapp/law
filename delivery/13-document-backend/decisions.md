# Decisions

- Reuse the existing tenant-scoped storage pattern and upload conventions rather than inventing a parallel storage architecture.
- Keep the document domain additive and compatibility-first, with link tables instead of duplicate file records.
- Treat `DocumentCategory` as configurable lookup data within the existing references infrastructure.
- Enforce cross-tenant ownership checks at the service layer for every document-link operation.
- Delay any broad refactor of legacy chat attachment storage until document linking and tenant-safety are validated.
