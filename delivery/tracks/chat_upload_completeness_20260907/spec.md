# Chat Upload Completeness Specification

## Goals

- Let a lawyer attach files or type a first message before a chat session exists.
- Create an empty `ChatSession` as soon as the user attaches a file with no session selected.
- Create a session on first send when the user types without attaching first, so attach is not the only bootstrap path.
- Keep file bytes in the browser until send. Persist `ChatAttachment` only with the user message.
- Show pending files in the composer, reject unsupported type and oversized files in the UI, and allow download of stored attachments.
- Accept Excel workbooks in addition to PDF, TXT, DOCX, and images already allowed in Phase 1.
- Bind the conversation rail to real sessions instead of mock data.

## Non-goals

OCR, document text extraction, running the queued `brief-extraction` job, n8n, MinIO/S3, virus scanning, a session-level file library (`messageId` null), orphan-session cleanup, token-by-token streaming, and a multi-workspace switcher are outside this track.

Extraction of PDF, TXT, Word, and Excel content for Brief Agent is the next track.

## Association model

- Every stored file is workspace-scoped and session-scoped.
- `ChatAttachment.messageId` is set when the file is sent with a user turn.
- Files chosen before send are not written to disk and have no `ChatAttachment` row.
- An empty session with no messages is acceptable if the user attaches and never sends. List it as a new chat.

## Users

Any ACTIVE workspace member may bootstrap a session by attaching or sending, attach files to a turn, and download attachments in that workspace.
