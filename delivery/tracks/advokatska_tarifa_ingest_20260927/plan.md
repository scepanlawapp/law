# Advokatska tarifa Ingestion — Plan

- [x] Create and register the delivery track artifacts.
- [x] Add the tariff to `PARAGRAF_CORE_SOURCES`.
- [x] Chunk `Tarifni broj N` lines as provision boundaries (`articleNumber = "Tarifni broj N"`), with a chunker spec.
- [x] Label citations: `Član N` for articles and the raw label for tariff items (grounding prompt block and web citation list), with specs.
- [x] Update the knowledge README and business-logic record.
- [x] Verify: knowledge, legal-grounding and web tests; dry-run ingest of the tariff.
- [x] Run real ingestion of the tariff (`npm run legal:ingest -- --url=… --slug=advokatska-tarifa`): INDEXED, 99 chunks (17 articles, 81 tariff items, heading). A vector search for "nagrada advokata za sastavljanje žalbe" returns tariff items labeled `Tarifni broj N`.

## Follow-up (not in this track)

- `zakon-o-sudskim-taksama` needs a re-ingest to pick up its 31 `Tarifni broj` labels (verified in a local chunking run). `--force` on unchanged content currently fails on the `(sourceId, contentHash)` unique key, so forced re-indexing must replace the existing version first.
- Re-export the corpus snapshot (`npm run legal:export`) so other machines get the tariff without re-embedding.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
