# knowledge

Provider-independent legal-source contracts and Serbian legal text chunking for PostgreSQL vector retrieval.

## Paragraf sources

`PARAGRAF_CORE_SOURCES` (`src/lib/legal-source-manifest.ts`) lists the core
public laws (`slug`, `url`, practice `area`) for the target office: procedure,
contracts, company, competition, IP, media, data protection, human rights, real
estate, agriculture, family, arbitration, and labor. It also includes the
Advokatska tarifa (`advokatska-tarifa`, `general` area).

The chunker splits on `Član N` and on `Tarifni broj N` lines. Tariff items are
stored with `articleNumber = "Tarifni broj N"` so they are not cited as the last
preceding article; citation labels print `Član N` only for numeric values.

```bash
npm run legal:ingest -- --dry-run                 # Zakon o radu only (default)
npm run legal:ingest -- --url=<paragraf url> --slug=<slug>
npm run legal:ingest -- --all --dry-run           # parse every manifest entry
npm run legal:ingest -- --area=ip                 # one practice area
npm run legal:ingest -- --all                     # embed + store everything
```

`--dry-run` fetches, validates, normalizes, and reports chunk counts without
calling the embedding provider. Batch runs are sequential with a short pause
between fetches, report each failure without stopping, and exit non-zero if any
source failed. Unchanged sources are skipped by content hash; `--force`
re-indexes.

## Corpus snapshot (skip re-embedding)

Share an already-embedded public corpus instead of re-running ingestion:

```bash
npm run legal:export                    # -> tmp/legal-corpus/legal-corpus-<date>.ndjson.gz
npm run legal:import -- <snapshot.ndjson.gz>
```

The snapshot holds public sources, their `INDEXED` versions and chunks with
embeddings (about 47 MB for the core corpus). Import checks the embedding model,
dimensions and latest applied migration, then merges like ingestion: versions
already present (same slug and content hash) are skipped, and nothing is
deleted. The file contains Paragraf text, so share it privately and never
commit it. Ingestion remains the source of truth.
