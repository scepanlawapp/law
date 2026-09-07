# Brief Agent Attachment Extraction Plan

- [ ] Add `ChatAttachmentExtractionStatus` enum and `extractionStatus` /
      `extractedText` / `extractionError` / `extractedAt` columns to
      `ChatAttachment` in `apps/api/prisma/schema.prisma`; generate the
      migration.
- [ ] Extend `ChatAttachmentSummary` in `libs/api/api-interfaces` with the
      extraction status field.
- [ ] Create `@law/extraction` lib (`libs/api/ai/extraction`) exporting
      `extractAttachmentText()`, dispatching on MIME type: `pdf-parse`
      (PDF), `mammoth` (DOCX), `exceljs` (XLS/XLSX), UTF-8 decode (TXT),
      `tesseract.js` (JPEG/PNG/WEBP, `eng`+`srp`+`srp_latn`).
- [ ] Add `pdf-parse`, `mammoth`, `exceljs`, `tesseract.js` to root
      `package.json`.
- [ ] Provide local Tesseract language data (`TESSDATA_DIR` env var +
      download script/doc), so OCR never fetches from a CDN at runtime.
- [ ] In `ChatService.runTriage`, after the `WorkflowJob` is created, set it
      to `RUNNING`, run extraction per attachment via
      `ChatStorageService.read`, persist results on `ChatAttachment`, then
      mark the job `COMPLETED` with an aggregated `output` (or `FAILED` on
      unexpected errors).
- [ ] Cover: PDF/DOCX/XLSX/TXT/image extraction success, a corrupt/
      unsupported file failing only that attachment, a zero-attachment
      legal message completing the job, and Serbian Cyrillic + Latin OCR
      output.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
