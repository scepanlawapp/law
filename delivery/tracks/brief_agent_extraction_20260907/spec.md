# Brief Agent Attachment Extraction Specification

## Goals

- Turn stored `ChatAttachment` files into plain text so the `brief-extraction`
  `WorkflowJob` has real content to work with, not just filename metadata.
- Support every MIME type already accepted by chat upload: PDF, TXT, DOCX,
  XLS/XLSX, and JPEG/PNG/WEBP images.
- Run OCR on images, and support Serbian Latin, Serbian Cyrillic, and
  English text.
- Persist extracted text per attachment so it can be inspected, retried, or
  reused without re-parsing the file.
- Keep processing entirely on-premise: no attachment bytes or extracted
  text leave the API process (no cloud OCR/parsing APIs).

## Non-goals

- Calling an LLM to turn extracted text into structured "brief facts" —
  that is a follow-up track. This track stops at raw extracted text.
- OCR fallback for scanned/image-only PDFs (PDFs are parsed via their text
  layer only in this track).
- A background job queue/worker infrastructure (BullMQ, Redis). Extraction
  runs synchronously inside the existing fire-and-forget triage flow.
- Any UI changes. Extraction status is stored on the backend only; surfacing
  it in the composer/transcript is a later track.
- n8n orchestration of extraction. It stays in-process in the NestJS API.

## Trigger & processing model

- Extraction is lazy: it runs when a `brief-extraction` `WorkflowJob` is
  created (i.e. after Portir classifies a message as `LEGAL`), not when a
  file is attached or uploaded.
- Extraction runs synchronously within the existing `runTriage` background
  flow in `ChatService` (already fire-and-forget relative to the HTTP
  response), immediately after the `WorkflowJob` row is created.
- The job is marked `RUNNING` while extraction is in progress, then
  `COMPLETED` once every attachment has been attempted — partial failure of
  individual attachments does not fail the whole job. The job is only
  marked `FAILED` on an unexpected error (e.g. the stored file is missing).
- A message queued for brief extraction with no attachments completes the
  job immediately using only `userText`.

## Extraction behavior per type

- `text/plain` → decode as UTF-8.
- `application/pdf` → extract the embedded text layer only (`pdf-parse`).
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
  → extract raw text (`mammoth`).
- `application/vnd.ms-excel`,
  `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` →
  concatenate cell text across all sheets (`xlsx`/SheetJS; chosen over
  `exceljs`, which cannot read legacy `.xls` workbooks).
- `image/jpeg`, `image/png`, `image/webp` → OCR with `tesseract.js` using
  `eng` + `srp` + `srp_latn` language data, resolved from a local,
  pre-downloaded language-data directory (no network calls at runtime).
- Any parse/OCR failure is recorded per attachment (`FAILED` +
  `extractionError`) without raising an exception that stops other
  attachments or the job.
- Very large extracted text is truncated (documented cap) before being
  written into `WorkflowJob.output` to keep the JSON payload bounded;
  the full text is still stored on `ChatAttachment.extractedText`.

## Data model

- `ChatAttachment` gains: `extractionStatus`
  (`PENDING` | `RUNNING` | `COMPLETED` | `FAILED` | `UNSUPPORTED`),
  `extractedText` (nullable, long text), `extractionError` (nullable),
  `extractedAt` (nullable timestamp).
- `WorkflowJob.output` for `brief-extraction` jobs holds an aggregate: the
  original `userText` plus, per attachment, its id, name, MIME type,
  extraction status, and (possibly truncated) text.

## Users

No user-facing change. Any ACTIVE workspace member who sends a legal
message with attachments benefits transparently; this is a backend-only
capability that a future Brief Agent track will consume.
