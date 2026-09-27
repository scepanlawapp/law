# Legal Corpus Snapshot — Plan

- [x] Create and register the delivery track artifacts.
- [x] Add `scripts/export-legal-corpus.ts` (`legal:export`) streaming public sources, INDEXED versions and chunks to gzipped NDJSON.
- [x] Add `scripts/import-legal-corpus.ts` (`legal:import`) with header checks and idempotent, non-destructive merge.
- [x] Update the knowledge README and business-logic record.
- [x] Verify: exporting the local corpus (33 sources, 9,294 chunks) gives a 47 MB file in about 9 s. Importing it into a freshly migrated scratch database takes about 4 s, and a checksum over chunk ids, text and embeddings matches the source database. Re-import skips all 33 versions. A snapshot with the wrong embedding model is refused, and so is one with a migration that isn't applied locally.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
