# Legal Corpus Snapshot — Specification

## What

Two commands for sharing an already-embedded public legal corpus between developers:

- `npm run legal:export [-- --out=<file>]` writes every public (`workspaceId IS NULL`) legal source with its `INDEXED` versions and chunks, including embeddings, to one gzipped NDJSON file.
- `npm run legal:import -- <file>` loads that file into the local database.

## Why

`legal:ingest -- --all` takes minutes, needs an OpenRouter key and live access to Paragraf, and can index slightly different text on different days as Paragraf pages change. A snapshot gives a new developer the same corpus in seconds, with no key. The embedding cost saved is small; the gains are speed, no key, and identical data. Ingestion stays the source of truth.

## Behavior

- File format: line 1 is a header (`format`, `formatVersion`, `embeddingModel`, `embeddingDimensions`, `latestMigration`, `exportedAt`, counts). Then, for each source, a `source` line, and for each version a `version` line followed by its `chunk` lines. Embeddings use pgvector text form.
- Import refuses a file whose format version, embedding model or dimensions don't match `LEGAL_EMBEDDING_MODEL` / `LEGAL_EMBEDDING_DIMENSIONS`. It also refuses when the file's latest migration isn't applied locally.
- Import merges the same way ingestion does and never deletes anything. It finds or creates each source by `slug` with no workspace, then skips a version whose `(source, contentHash)` already exists. Otherwise it inserts the version and all its chunks in one transaction. Existing `DraftCitation` links and workspace-owned sources are untouched. Re-importing the same file skips everything.
- Workspace-owned sources are never exported.

## Out of scope

- Hosting the snapshot. It contains Paragraf's text, so it must not be committed; share it privately (for example as a private release asset or on a shared drive). The default output goes under the git-ignored `tmp/legal-corpus/`.
- Retiring older `INDEXED` versions of the same source. Search already returns every `INDEXED` version; this track doesn't change that.
