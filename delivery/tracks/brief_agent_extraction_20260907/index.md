# Brief Agent Attachment Extraction

- **Track ID:** `brief_agent_extraction_20260907`
- **Type:** Feature
- **Status:** Not started

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Not started. Chat upload completeness persists attachments and stores the
`brief-extraction` `WorkflowJob` in `QUEUED` status with only attachment
metadata; this track extracts real text (PDF, DOCX, XLSX, TXT, OCR'd
images) so the job has usable content. The LLM step that turns extracted
text into structured brief facts is a follow-on track.
