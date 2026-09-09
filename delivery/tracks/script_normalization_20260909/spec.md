# Script Normalization Specification

## Goals

- Make **Serbian Latin** the single canonical script for everything the system stores, prompts, matches on, or (later) embeds. Cyrillic exists only at the inbound edge (documents from courts/clients) and the outbound edge (podnesci for courts).
- Add `@law/transliteration` (`libs/api/ai/transliteration`): dependency-free, table-driven `toLatin()`, `toCyrillic()`, `detectScript()` with correct handling of digraphs (`lj/nj/dž`, `Lj/Nj/Dž`, `LJ/NJ/DŽ`) and protection of tokens that must never be converted (URLs, emails, `[UNOS POTREBAN: …]` placeholders, ISO currency codes). Legal abbreviations (`ZPP`, `ZOO`, `čl.`, `st.`) **are** converted — courts write them in Cyrillic.
- Apply `toLatin()` inside `@law/extraction` before `extractedText` is returned, and record the detected source script on `ChatAttachment.sourceScript` (`LATIN | CYRILLIC | MIXED | NONE`).
- Apply `toLatin()` to user message text before it is used to build any LLM prompt (triage, brief extraction). Persisted `ChatMessage.content` stays as typed; only prompt inputs are normalized.
- Expose Cyrillic drafts on read: `GET chat/jobs/:jobId/draft?script=cyrillic` returns `documentText` transliterated; the stored value remains Latin.
- Scanned PDFs: when `pdf-parse` yields fewer than `PDF_OCR_MIN_TEXT_CHARS` characters, rasterize up to `PDF_OCR_MAX_PAGES` pages with `pdf-parse`'s built-in `getScreenshot()` (bundled `pdfjs-dist` + `@napi-rs/canvas`, no new dependency) and run them through the existing Tesseract worker (`eng+srp+srp_latn`), then transliterate.

## Non-goals

- Changing draft generation prompts — drafts continue to be generated in Latin; Cyrillic is a presentation concern.
- DOCX/PDF export (separate track `draft_export_docx_20260909`) — it will consume `toCyrillic()` from this lib.
- Qdrant ingestion — separate track; it relies on this track's guarantee that text is Latin.
- Backfilling existing `ChatAttachment.extractedText` rows.
- Handwriting recognition or OCR quality improvements beyond the rasterize-and-OCR fallback.

## Transliteration rules

- Cyrillic → Latin is unambiguous: 30 letters map 1:1 (`љ→lj`, `њ→nj`, `џ→dž`).
- Latin → Cyrillic: greedy digraph matching (`lj`, `nj`, `dž` before single letters). Case of a digraph follows its first letter for `Lj/Nj/Dž`; `LJ/NJ/DŽ` is treated as uppercase when the following or preceding letter is uppercase (all-caps words).
- Protected spans (regex-matched, left untouched by `toCyrillic`): URLs, emails, `[UNOS POTREBAN: …]` markers, ISO currency/banking codes (`EUR`, `RSD`, `USD`, `IBAN`, `SWIFT`). Markdown syntax is non-alphabetic and passes through unchanged.
- Known words where `nj`/`dž` are two letters (`injekcija`, `konjunktura`, `nadživeti`, …) are split via a prefix exceptions list.
- Letters outside the Serbian alphabet (`q`, `w`, `x`, `y`) are left as-is; a word containing them is treated as foreign and not converted.
- `detectScript()` counts Serbian Cyrillic vs Latin letters; `MIXED` if both ≥ 10% of letters, `NONE` if there are no letters.

## Context model

- Extraction order per attachment: bytes → format extractor → (PDF fallback OCR) → `toLatin()` → truncate → persist.
- Prompt builders receive already-normalized text; they do not call the lib themselves.

## Users

No UI change in this track. Lawyers indirectly benefit: scanned Cyrillic decisions now produce populated briefs, and the draft endpoint can return court-ready Cyrillic text.
