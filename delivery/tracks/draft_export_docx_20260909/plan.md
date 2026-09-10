# Draft DOCX Export Plan

- [x] 74b1e20 Add `docx` dependency; `libs/api/ai/documents` (`@law/documents`) with `renderDraftDocx({ text, script }): Promise<Buffer>` and a small Markdown-to-blocks parser (headings, paragraphs, lists, placeholders).
- [x] 74b1e20 `DraftExportQueryDto { format: "docx"; script: "latin" | "cyrillic" }`; controller route streaming the buffer with proper headers; workspace scoping.
- [x] 74b1e20 `AuditEvent` on export.
- [x] 74b1e20 Angular: "Download DOCX" button in `draft-review-panel` (respects current script toggle); `DraftApiClient.exportUrl()`.
- [x] 74b1e20 Tests: renderer, service, and controller cover valid DOCX output with Cyrillic text, highlighted placeholders, final-text precedence, audit metadata, filename, and response headers.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
