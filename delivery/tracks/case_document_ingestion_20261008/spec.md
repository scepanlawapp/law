# Case document ingestion: embeddings, facts, and hash dedup

## Problem

Workspace documents and chat attachments are only read lazily: the assistant extracts text on the first `read_document` call and stores it per `DocumentVersion` or per `ChatAttachment`. There are no embeddings over office documents, no structured facts, and no deduplication. Consequences:

- Semantic questions ("when was the decision served?") only work if the model guesses the exact words for `search_documents` or reads whole files.
- Data already sitting in a scanned ID card or an APR excerpt (name, JMBG, PIB, address) is re-read or re-typed when drafting a tužba.
- The same file uploaded twice (dialog, new version, chat, chat attachment filed to a case) is stored, extracted, and would be embedded again — wasted disk and provider cost.
- Any non-archived case document is readable by the assistant; users have no way to keep a file away from AI.

## Goals

1. Ingest each unique file once per workspace (content-addressed by SHA-256): text, chunks with embeddings, a document-kind classification, and structured facts for supported kinds.
2. Reuse that content wherever the file appears: workspace documents, versions, chat attachments, and attachments filed to a case.
3. Make AI access an explicit per-document opt-in. Off means the assistant cannot read the content at all.
4. Use the content in chat and drafting: semantic search, facts with verified quotes, prefilled brief fields.
5. Propose (never auto-apply) filling empty client fields from matching facts.

## Non-goals (v1)

- Fact extraction for contracts and powers of attorney (contracts already have `review_contract`).
- A facts viewer on the document detail page.
- Proposals created outside an assistant chat (for example from the client page).
- Cross-workspace dedup.
- Exposing extracted text or facts through the document API.

## Decisions

| Topic | Decision |
| --- | --- |
| Scope | Embeddings, facts, and hash dedup built together on one pipeline. |
| Dedup unit | `DocumentContent` unique on `(workspaceId, sha256)`; `DocumentVersion` and `ChatAttachment` reference it. `StoredFile` bytes are reused on a hash match. |
| AI access | `Document.aiAccess`, default `false` for dialog/documents-page uploads. Chat attachments are implicitly allowed while unfiled; a filed attachment creates its document with `aiAccess = true`. Users can toggle per document or in bulk. |
| Off semantics | Strict. Content stays stored but every content-reading tool refuses; `list_documents` shows the title with `aiAccess: off`. |
| Existing data | Existing documents start with access off; already-filed chat attachments start on. |
| Fact kinds (v1) | `ID_CARD`, `PASSPORT`, `APR_EXCERPT`, `COURT_DECISION`, `ADMIN_DECISION`. Other kinds get text and embeddings only. |
| Facts location | Facts belong to the content, not to a document or client. Client ownership is decided at use time. |
| Client updates | `PendingAction` proposals for empty client fields only, when the subject clearly matches the document's single linked client. Conflicts become warnings. |

## Data model

```text
StoredFile (existing)        + @@index([workspaceId, sha256]); reused on hash match
DocumentContent (new)        id, workspaceId, sha256, mimeType, sizeBytes,
                             status PENDING|EXTRACTING|EMBEDDING|CLASSIFYING|READY|FAILED|UNSUPPORTED,
                             failedStep?, error?, extractedText?, sourceScript?, truncated,
                             pipelineVersion, embeddingModel?, embeddingDimensions?,
                             documentKind ID_CARD|PASSPORT|APR_EXCERPT|COURT_DECISION|ADMIN_DECISION|OTHER?,
                             kindConfidence?, processedAt?, createdAt, updatedAt
                             @@unique([workspaceId, sha256])
DocumentContentChunk (new)   id, contentId, workspaceId, ordinal, text, charStart, charEnd,
                             embedding vector(1024)?, embeddingModel, embeddingDimensions
                             HNSW/ivfflat cosine index on embedding; @@index([workspaceId, contentId])
DocumentFact (new)           id, contentId, workspaceId, subjectKey ("person:1", "company:1", "decision"),
                             subjectType PERSON|COMPANY|DECISION, subjectRole?, field, value,
                             normalizedValue?, quote, charStart?, confidence, createdAt
DocumentVersion (existing)   + contentId? → DocumentContent
ChatAttachment (existing)    + sha256?, + contentId? → DocumentContent
Document (existing)          + aiAccess Boolean @default(false), aiAccessChangedAt?, aiAccessChangedByUserId?
```

- All new tables carry `workspaceId` and every query filters by it. Content is never shared across workspaces.
- `extractedText`/`extractionStatus` on `DocumentVersion` and `ChatAttachment` move to `DocumentContent`; the old columns are dropped in a follow-up migration after the backfill is verified.
- `pipelineVersion` bumps when extraction, chunking, embedding model, or fact schemas change; a reindex reprocesses each unique content once.

## Ingestion pipeline

BullMQ job `document-ingest` on its own `document-ingest` BullMQ queue, `jobId = content-<contentId>` (duplicate triggers collapse).

Triggers:

- Chat attachment upload (always).
- Document upload or new version with `aiAccess = true`.
- `aiAccess` switched on for a document whose current version's content is not `READY` on the current pipeline version.
- Filing a chat attachment links the version to the existing content; no new job.

Steps (each persisted; a retry resumes from the failed step):

1. Hash → find-or-create `DocumentContent` via unique upsert. Stop if `READY` on the current `pipelineVersion`.
2. Extract text with `@law/extraction` (text layer, DOCX, spreadsheets, OCR for images and scanned PDFs), Serbian Latin. Reuse already-extracted text when present. Unsupported MIME → `UNSUPPORTED`.
3. Chunk: ~1,500 chars, paragraph-aligned, 200-char overlap, with character offsets.
4. Embed in batches through the `@law/knowledge` embedding provider (same model/dimensions as legal sources).
5. Classify from the first ~4,000 chars with a small structured call: `documentKind` + confidence; below threshold → `OTHER`.
6. For the five supported kinds, extract facts with a per-kind schema. Each fact must carry a quote that occurs in the text (diacritic/script-insensitive check). Code validation: JMBG checksum and date-of-birth consistency, PIB check digit, 8-digit MB, valid dates. Failing facts are dropped.
7. `READY`, emit SSE `document.content.updated`.

Fact fields per kind:

- `ID_CARD` / `PASSPORT`: fullName, firstName, lastName, jmbg, dateOfBirth, placeOfBirth, address, documentNumber, issuedDate, expiryDate, issuingAuthority, nationality.
- `APR_EXCERPT`: companyName, registrationNumber (MB), taxNumber (PIB), seatAddress, legalForm, representatives (name, role, jmbg if stated).
- `COURT_DECISION` / `ADMIN_DECISION`: authority, caseNumber, decisionDate, parties (name, role), outcome, servedDate (only if stated), legalRemedyInstruction.

Limits: env-configured max embedded characters per content; OCR pages stay capped by `PDF_OCR_MAX_PAGES`.

If a read tool needs text while the job is still running, it performs the extraction step synchronously and stores it on the same content row; the job continues from chunking.

## Access and assistant use

`DocumentAccessPolicy` (chat feature) decides readability of a ref:

- `doc:<id>`: non-archived and `aiAccess = true`.
- `att:<id>`: allowed while unfiled; once filed, the document's `aiAccess` applies.

Applied to `read_document`, `search_documents`, `search_case_documents`, `get_document_facts`, `draft_document`, `review_contract`, `summarize_case_documents`, `detect_deadlines`. Refusals return a fixed message telling the user how to enable access; the prompt forbids guessing content.

Tools:

- `search_case_documents` (new): pgvector cosine search over readable chunks of the session's case documents and attachments, returning `[n]` citations with document ref and offsets.
- `search_documents`: unchanged exact search; the prompt routes questions to semantic search and literal strings to exact search.
- `get_document_facts` (new): facts from readable case/session documents grouped by subject with value, quote, source, confidence; conflicting values are returned together and flagged.
- `propose_client_update_from_document` (new, side-effect level confirm): creates `PendingAction` `update_client_from_document`.

Drafting: the brief-extraction workflow receives facts as structured input. Party fields filled from facts show their source document in the Case-work pane. Placeholders remain only where no fact exists; user-typed chat data wins over facts.

Client proposals:

- Preconditions: the document is linked to exactly one client and a subject matches it (person: first and last name, script/diacritic-insensitive, or existing JMBG; company: MB or PIB).
- One proposal per empty field among `jmbg`, `firstName`, `lastName`, `registrationNumber`, `taxNumber`, address, identification document number/dates; shows value, source, and quote.
- A different existing value produces a warning, never a proposal. No match, no proposal.
- Approval writes the field and an activity-log row. Created in chat only (agent tool or automatically after a filed attachment finishes ingestion).

## API

- `POST /api/documents`: optional `aiAccess` (default `false`).
- `PATCH /api/documents/:id`: `aiAccess`; writes an activity-log entry; enabling queues ingestion.
- `PATCH /api/documents/ai-access`: bulk `{ documentIds, aiAccess }`.
- `POST /api/documents/:id/ai-reprocess`: re-queue a `FAILED` content.
- List/detail responses add `aiAccess`, `aiStatus` (`OFF | QUEUED | PROCESSING | READY | FAILED | UNSUPPORTED`), and `documentKind`. No text or facts.

## UI

- Upload dialog: "AI pristup" switch for the batch with per-row override, default off, with tooltip:
  "Dozvoli AI asistentu da pročita sadržaj ovog fajla. Asistent će ga koristiti za pretragu činjenica i podataka (npr. imena, JMBG, datumi), za tačnije odgovore o predmetu i za popunjavanje nacrta. Možete isključiti u bilo kom trenutku – sadržaj tada više neće biti dostupan asistentu."
- Documents list/grid and case Documents tab: AI status icon with tooltip; selection toolbar "Uključi AI pristup" / "Isključi AI pristup".
- Document detail: switch, status, recognized kind label; turning off asks for confirmation once ("Asistent više neće moći da čita ovaj dokument"). Filed chat attachments show "Iz razgovora sa asistentom".
- Chat attachment chips show ingestion status.
- Spartan Helm primitives, semantic tokens, translation keys only.

## Error handling

- Per-step error stored on the content row; BullMQ retries 3× with backoff.
- Partial success remains usable: text without embeddings still supports read/exact search; classification or fact failures leave content `READY` without facts.
- Provider outages never block uploads or chat messages.
- Toggling off during a job does not cancel it; access is enforced at read time.
- Concurrent duplicate uploads are resolved by the unique upsert and the job id.

## Migration and backfill

- Schema migration: new tables, columns, vector index, `StoredFile` sha256 index.
- `npm run documents:backfill-content` (idempotent): hash chat attachment files, link versions/attachments to content rows, move existing extracted text without LLM calls, merge duplicates, set `aiAccess = true` on documents created from chat attachments.
- Separate opt-in command queues embeddings/facts for documents with access on.
- Follow-up migration drops the old text columns.
- Update `seed-demo-data.cjs` with documents in both access states.

## Testing

- Unit: chunk offsets; JMBG/PIB/MB validation; quote verification; classification threshold; access policy matrix; conflict flagging.
- Service: same file through dialog, chat, and filing → one content, one job, one stored file; toggle off → refusals; toggle on with existing content → no new job.
- Pipeline: mocked embedding/LLM providers; retry resumes at the failed step.
- Tools: refusal messages; semantic search returns only readable, workspace-scoped chunks.
- Proposals: empty field → proposal; filled field → warning only; unmatched subject → nothing.
- Frontend: upload switch payload, status icon, bulk toolbar, confirm-off dialog.
- Real OCR test stays opt-in (`RUN_OCR_INTEGRATION=1`) with a sample ID-card fixture.

## Success criteria

- A scanned ID uploaded with access on (or attached in chat) yields verified name/JMBG facts; a later tužba draft for that client has those party fields filled with a cited source and no placeholder.
- Uploading an identical file again through any path creates no new stored bytes, no new content row, and no provider calls.
- With access off, no assistant tool returns any of the document's text or facts.
- Client fields are only changed through an approved proposal, and only when empty.
