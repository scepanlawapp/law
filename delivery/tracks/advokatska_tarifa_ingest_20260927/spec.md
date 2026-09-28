# Advokatska tarifa Ingestion — Specification

## What

Add the _Tarifa o nagradama i naknadama troškova za rad advokata_ ("Sl. glasnik RS", br. 43/2023 i 56/2025) from Paragraf Lex to the legal knowledge corpus, so the assistant and drafting can cite it.

## Why

The office bills mostly by the Advokatska tarifa. Grounded answers about fees and cost claims (troškovnik) are the first step toward AT-based billing proposals on the modernization roadmap.

## Scope

- Add the tariff page to `PARAGRAF_CORE_SOURCES` (`general` area).
- The page has 17 articles (`Član`) followed by 81 tariff items (`Tarifni broj N.`). Today every tariff item is chunked under `Član 17`. The chunker must treat a `Tarifni broj N` line as a provision boundary and store it as `articleNumber = "Tarifni broj N"`.
- Citation labels (the grounding prompt block and the assistant citation list) show `Član N` for article numbers and the stored label as-is for tariff items.
- The same rule also fixes the tariff part of `Zakon o sudskim taksama` after a forced re-ingest.

## Out of scope

- A structured tariff model (points per item, point value, calculator) for billing. This comes in a later track.
- Schema changes. `articleNumber` stays a nullable string.

## Acceptance

- `legal:ingest -- --slug=… --dry-run` on the tariff reports chunks labeled `Tarifni broj 1` … `Tarifni broj 81`.
- Knowledge, grounding and web tests pass.
