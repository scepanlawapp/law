# Brief Agent Attachment Extraction Plan

- [x] 48c1208 Add `ChatAttachmentExtractionStatus` enum and `extractionStatus` /
      `extractedText` / `extractionError` / `extractedAt` columns to
      `ChatAttachment` in `apps/api/prisma/schema.prisma`; generate the
      migration.
- [x] 48c1208 Extend `ChatAttachmentSummary` in `libs/api/api-interfaces` with the
      extraction status field.
- [x] 48c1208 Create `@law/extraction` lib (`libs/api/ai/extraction`) exporting
      `extractAttachmentText()`, dispatching on MIME type: `pdf-parse`
      (PDF), `mammoth` (DOCX), `xlsx`/SheetJS (XLS/XLSX — swapped from the
      originally planned `exceljs`, which cannot read legacy `.xls`), UTF-8
      decode (TXT), `tesseract.js` (JPEG/PNG/WEBP, `eng`+`srp`+`srp_latn`).
- [x] 48c1208 Add `pdf-parse`, `mammoth`, `xlsx`, `tesseract.js` to root
      `package.json`.
- [x] 48c1208 Provide local Tesseract language data (`TESSDATA_DIR` env var +
      `scripts/download-tessdata.sh`), so OCR never fetches from a CDN at
      runtime.
- [x] 48c1208 In `ChatService.runTriage`, after the `WorkflowJob` is created, set it
      to `RUNNING`, run extraction per attachment via
      `ChatStorageService.read`, persist results on `ChatAttachment`, then
      mark the job `COMPLETED` with an aggregated `output` (or `FAILED` on
      unexpected errors).
- [x] 48c1208 Cover: PDF/DOCX/XLSX/TXT/image extraction success, a corrupt/
      unsupported file failing only that attachment, a zero-attachment
      legal message completing the job. Manually verified PDF, DOCX, and
      PNG (OCR) extraction end-to-end; Serbian Cyrillic/Latin OCR fixtures
      and XLS/XLSX automated coverage are still only unit-tested via the
      dispatcher (mocked), not manually verified.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
