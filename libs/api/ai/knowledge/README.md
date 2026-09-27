# knowledge

Provider-independent legal-source contracts and Serbian legal text chunking for PostgreSQL vector retrieval.

## Paragraf sources

`PARAGRAF_CORE_SOURCES` (`src/lib/legal-source-manifest.ts`) lists the core
public laws (`slug`, `url`, practice `area`) for the target office: procedure,
contracts, company, competition, IP, media, data protection, human rights, real
estate, agriculture, family, arbitration, and labor.

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
