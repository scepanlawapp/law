# Draft DOCX Export Specification

## Goals

- `GET chat/drafts/:draftId/export?format=docx&script=cyrillic|latin` (default `cyrillic` — courts require it) returning `application/vnd.openxmlformats-officedocument.wordprocessingml.document` with a `Content-Disposition` filename derived from the draft (`tuzba-<sessionId-short>-<date>.docx`).
- Source text is `finalDocumentText ?? documentText`; `toCyrillic()` from `@law/transliteration` is applied when `script=cyrillic`.
- Map the draft's Markdown structure to DOCX: headings → bold centered/left headings; paragraphs; lists → numbered/bulleted; `[UNOS POTREBAN: …]` placeholders highlighted (yellow) so nothing unfilled reaches a court unnoticed.
- Typography: Times New Roman 12pt, A4, 2.5 cm margins, 1.15 line spacing.
- Export writes an `AuditEvent` (`draft.exported`) with script and format.

## Non-goals

- PDF (revisit with LibreOffice headless if lawyers need it).
- Letterhead/branding per workspace (later).
- Editing inside the DOCX round-tripping back into the system.

## Users

Any workspace member with access to the session; typically the approving lawyer.
