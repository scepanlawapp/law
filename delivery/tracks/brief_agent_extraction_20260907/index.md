# Brief Agent Attachment Extraction

- **Track ID:** `brief_agent_extraction_20260907`
- **Type:** Feature
- **Status:** Done

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Done. Chat attachments (PDF, DOCX, TXT, XLS/XLSX, and OCR'd JPEG/PNG/WEBP
images) are now parsed to plain text when a `brief-extraction` `WorkflowJob`
runs, and the extracted text is persisted per attachment. PDF, DOCX, and
PNG OCR were manually verified end-to-end; the LLM step that turns
extracted text into structured brief facts is a follow-on track.
