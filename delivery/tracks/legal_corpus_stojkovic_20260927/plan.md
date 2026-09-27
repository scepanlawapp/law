# Legal Corpus for Target Office — Plan

- [x] Create and register the delivery track artifacts.
- [x] Add `PARAGRAF_CORE_SOURCES` manifest (`slug`, `url`, `area`) to `@law/knowledge` with a validation spec.
- [x] Add `--all` / `--area=<area>` batch mode to `scripts/ingest-legal-source.ts` (sequential, per-source error isolation, summary, non-zero exit on failure).
- [x] Update the knowledge README and business-logic record.
- [x] Verify: `nx test knowledge` passes; `legal:ingest -- --all --dry-run` parses all 33 entries (about 9,550 chunks, ZOO largest at 2,264).
- [x] Run real ingestion (`npm run legal:ingest -- --all`): 32 new laws INDEXED, Zakon o radu SKIPPED; database holds 33 indexed sources and 9,294 chunks; a second run SKIPPED all 33.
- [ ] Manual check: assistant cites the new laws (e.g. a trademark or company-law question).

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
