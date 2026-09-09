# Draft DOCX Export Plan

- [ ] Add `docx` dependency; `libs/api/ai/documents` (`@law/documents`) with `renderDraftDocx({ text, script }): Promise<Buffer>` and a small Markdown-to-blocks parser (headings, paragraphs, lists, placeholders).
- [ ] `DraftExportQueryDto { format: "docx"; script: "latin" | "cyrillic" }`; controller route streaming the buffer with proper headers; workspace scoping.
- [ ] `AuditEvent` on export.
- [ ] Angular: "Download DOCX" button in `draft-review-panel` (respects current script toggle); `DraftApiClient.exportUrl()`.
- [ ] Tests: renderer produces valid zip with `word/document.xml` containing Cyrillic text and highlighted placeholders; controller content-type and filename.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
