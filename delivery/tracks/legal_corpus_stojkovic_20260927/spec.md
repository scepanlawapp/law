# Legal Corpus for Target Office — Specification

## What

A checked-in manifest of core Serbian laws from Paragraf Lex, grouped by practice area, plus a batch mode for `npm run legal:ingest` (`--all`, `--area=<area>`), so the legal knowledge base covers more than `Zakon o radu`.

## Why

The target office ([stojkovic.rs](https://www.stojkovic.rs/)) practices media law, intellectual property, human rights, competition, company and commercial law, contracts, damages and debt collection, real estate (including cadastre and APR filings), agricultural law, family law, personal data protection, and domain and general arbitration. Assistant answers and drafting citations can only ground on indexed sources. Before this track, the only indexed source was `Zakon o radu`.

## Scope

- Core manifest (about 30 laws): procedure (Ustav, ZPP, ZVP, ZIO, sudske takse, advokatura, ZUP, upravni sporovi), plus the main statute for each practice area listed above. `Zakon o radu` keeps its existing slug `zakon-o-radu`.
- Each manifest entry has `slug`, `url` (`https://www.paragraf.rs/propisi/*.html`) and `area`.
- Batch ingestion runs sequentially with a pause between fetches. A failing source is reported and does not stop the run. The command exits non-zero if any source failed. Unchanged sources are skipped through the existing content-hash check.
- `--url` / `--slug` single-source mode and the default (Zakon o radu) are unchanged.

## Out of scope / known gaps

- Domain-name disputes: governed by RNIDS rules, not a statute on Paragraf.
- Professional codes (e.g. Kodeks profesionalne etike advokata), bylaws (pravilnici), and secondary laws (leasing, factoring, pledge register, taxes) can be added to the manifest later.
- Tracking amendments over time or scheduling re-ingestion.
