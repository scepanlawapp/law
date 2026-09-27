# Assistant Document Access — Specification

## Problem

A PDF attached in chat is a `ChatAttachment`. Its text is extracted into `ChatAttachment.extractedText`, but only the drafting pipeline reads it. The agent sees only `[Prilozi: name.pdf]` and has no tool that returns document text, so later questions about the document ("does it mention X?") fail with "I cannot access the document".

Linking the chat to a case (brief apply or manual link) only sets `ChatSession.caseId`. The attachment never becomes a `Document`, so it does not appear among the case's documents.

## Decisions

- **Auto-promote.** When a chat session is linked to a case (brief apply, manual link, or a new upload into an already-linked session), each attachment becomes a workspace `Document` linked to the case and its client. Promotion is idempotent (`ChatAttachment.documentId`, idempotency key `chat-attachment:<id>`), logged as `DOCUMENT_CREATED` with `source: CHAT_ATTACHMENT`, and best effort: a failure never breaks the link and is retried on the next trigger.
- **Text per document version, no embeddings.** `DocumentVersion` stores extraction status, Latin text, source script, and error. Promoted attachments reuse the text already extracted in chat. Other documents are extracted lazily on the first assistant read.
- **Scope.** The assistant reads the current chat's unpromoted attachments plus the non-archived documents linked to the chat's case, including documents uploaded through the upload modal. Workspace scoping applies to every query.

## Assistant tools (read-only, side effect `none`)

- `list_documents` — short ref, title, file name, text status.
- `read_document({ ref, offset? })` — a text window (about 12,000 characters) with `nextOffset` and `totalChars`.
- `search_documents({ query, ref? })` — case- and diacritic-insensitive substring search on Latin text; up to 10 snippets per document with offsets.

The prompt tells the assistant to search or read before claiming it has no access and to quote the text it relies on.

## Non-goals

- Embeddings / semantic search over office documents.
- Documents library UI.
- Workspace-wide document search from the assistant.
