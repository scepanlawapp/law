# Script Normalization (Cyrillic/Latin) + Scanned-PDF OCR

- **Track ID:** `script_normalization_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Done. `@law/transliteration` (pure-TS Latin↔Cyrillic with digraph handling) is applied at ingestion (attachment extraction, user message text) so every persisted/prompted/embedded string is Serbian Latin. Cyrillic is produced only on draft read (`?script=cyrillic`). Scanned PDFs get an OCR fallback when the text layer is empty.
