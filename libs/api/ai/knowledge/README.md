# knowledge

Provider-independent legal-source contracts and Serbian legal text chunking for PostgreSQL vector retrieval.

The first source adapter targets the Zakon o radu page at
`https://www.paragraf.rs/propisi/zakon_o_radu.html`. Run
`npm run legal:ingest -- --dry-run` to fetch, validate, normalize, and report
the chunk count without calling the embedding provider.
