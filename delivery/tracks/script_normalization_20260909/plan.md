# Script Normalization Plan

- [x] 9dc9585 Create `libs/api/ai/transliteration` (`@law/transliteration`) mirroring `libs/api/ai/extraction` project layout (`project.json`, `tsconfig*.json`, `jest.config.cts`, `eslint.config.mjs`); register path alias in `tsconfig.base.json`.
- [x] 9dc9585 Implement `toLatin(text)`, `toCyrillic(text)`, `detectScript(text): "LATIN" | "CYRILLIC" | "MIXED" | "NONE"` with digraph handling, protected spans and an exceptions list; unit tests for digraphs, all-caps, placeholders, URLs, ZPP citations and round-trip stability.
- [x] 9dc9585 Add `sourceScript` (`ChatAttachmentSourceScript` enum, nullable) to `ChatAttachment`; migration `20260909111635_chat_attachment_source_script`; include it in `ChatAttachmentSummary`.
- [x] 9dc9585 `extractAttachmentText`: run `detectScript` then `toLatin` on the extracted text; return `sourceScript` alongside `text`; persist in `ChatService`.
- [x] 9dc9585 `ChatService`: normalize user text with `toLatin` before it reaches `runTriage`/brief-extraction prompt builders (persisted `ChatMessage.content` untouched).
- [x] 9dc9585 `GET chat/jobs/:jobId/draft?script=latin|cyrillic` (default `latin`): validated via `DraftQueryDto`; `toCyrillic` applied to `documentText` on the fly; response carries `script`.
- [x] 9dc9585 PDF OCR fallback in `pdf-extractor.ts` via `PDFParse.getScreenshot()` when text-layer chars < `PDF_OCR_MIN_TEXT_CHARS` (default 50); cap at `PDF_OCR_MAX_PAGES` (default 20); reuses `ocr-extractor` worker; env documented in `.env.example`.
- [x] 9dc9585 Tests: extraction returns Latin + `sourceScript` for Cyrillic input; draft endpoint Cyrillic variant; opt-in real-OCR integration test (`pdf-ocr-fallback.spec.ts` with `__fixtures__/scanned-cyrillic.pdf`).


## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
