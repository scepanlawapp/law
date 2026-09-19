# PostgreSQL Legal Knowledge Retrieval Plan

- [x] Create and register the delivery track artifacts.
- [x] Add provider-independent embedding contracts, BGE-M3 configuration, and Serbian legal chunking with focused tests.
- [x] Add PostgreSQL legal source/version/chunk models and a `vector(1024)` migration with similarity indexes.
- [x] Add an OpenRouter-compatible embeddings adapter with dimension validation and bounded batching.
- [x] Add a validated Paragraf HTML source adapter for `Zakon o radu` with hashing, version metadata, and rate limits.
- [x] Add a repeatable dry-run/re-index ingestion command for public and workspace-owned content.
- [x] Add workspace-scoped vector search contracts and service/controller boundary.
- [x] Remove live Qdrant/template-retrieval references and update environment/documentation/business-logic records.
- [x] Run focused tests, Prisma generation/migration, API build/lint, idempotent ingestion, and retrieval verification. The Zakon o radu source was embedded successfully and verified in PostgreSQL as one indexed version with 295 chunks; repeat ingestion is idempotently skipped.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
