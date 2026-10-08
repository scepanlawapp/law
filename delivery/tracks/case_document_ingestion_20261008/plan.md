# Case Document Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest every unique file once per workspace (text, chunks with embeddings, kind, verified facts), gate assistant reads behind a per-document AI-access opt-in, and use the content for semantic search, facts, drafting, and client-field proposals.

**Architecture:** A pure AI library `@law/document-intelligence` (chunking, identifier validation, quote verification, classification and fact schemas/runners) and a Nest feature `@law/document-ingestion` (content rows keyed by `(workspaceId, sha256)`, a BullMQ `document-ingest` queue and processor, chunk search, facts reads). `@law/workspace-documents` and `@law/chat` link versions/attachments to content and enqueue ingestion; the chat assistant reads text, chunks, and facts only through a single access policy.

**Tech Stack:** Nx, NestJS, Prisma + PostgreSQL `pgvector`, BullMQ/Redis, `@law/knowledge` `OpenRouterEmbeddingProvider` (`BAAI/bge-m3`, 1024 dims), `@law/llm` `ChatModelProvider` via `MastraChatModelProvider`, Mastra tools (`@law/mastra`), Angular 22 + Spartan Helm.

**Spec:** [spec.md](spec.md)

## Global Constraints

- Every query on `DocumentContent`, `DocumentContentChunk`, `DocumentFact` filters by `workspaceId`; content is never shared across workspaces.
- Stored and prompted text is Serbian Latin (`toLatin`); facts are stored in Latin.
- Embeddings: model `BAAI/bge-m3` (env `LEGAL_EMBEDDING_MODEL`), 1024 dimensions, same provider as legal sources.
- Chunking: ~1,500 chars, paragraph-aligned, 200-char overlap, with `charStart`/`charEnd`.
- Classification input: first 4,000 chars; threshold env `DOCUMENT_KIND_MIN_CONFIDENCE` default `0.6`.
- Fact kinds: `ID_CARD`, `PASSPORT`, `APR_EXCERPT`, `COURT_DECISION`, `ADMIN_DECISION`; everything else `OTHER`.
- Max embedded characters per content: env `DOCUMENT_EMBED_MAX_CHARS` default `200000`.
- `Document.aiAccess` defaults to `false`; documents created from chat attachments get `true`.
- Off is strict: no tool returns text, chunks, or facts of a document with `aiAccess = false`.
- Client fields are only changed by an approved `PendingAction` of type `update_client_from_document`, and only when empty.
- Tooltip copy (exact): "Dozvoli AI asistentu da pročita sadržaj ovog fajla. Asistent će ga koristiti za pretragu činjenica i podataka (npr. imena, JMBG, datumi), za tačnije odgovore o predmetu i za popunjavanje nacrta. Možete isključiti u bilo kom trenutku – sadržaj tada više neće biti dostupan asistentu."
- Turn-off confirmation copy (exact): "Asistent više neće moći da čita ovaj dokument"
- UI: Spartan Helm primitives, semantic tokens, translation keys; `@if/@for`; signals.
- After Prisma changes update `apps/api/prisma/seed-demo-data.cjs`; after behavior changes update `.github/bussiness-logic-done-so-far.md`.

## Deviations from the spec (found while mapping the code)

1. **Separate queue.** The `workflow` queue payload is session-bound (`WorkflowJobPayload.sessionId`/`jobId` → `WorkflowJob` row). Ingestion uses its own BullMQ queue `document-ingest` (same Redis, processor in the API process), `jobId = content:<contentId>`.
2. **Status refresh in the documents UI is polling.** There is no workspace-level SSE stream; the documents UI polls detail/list every 5 s while any visible row is `QUEUED`/`PROCESSING`. Chat sessions still receive SSE `document.content.updated` for their attachments.
3. **Client proposals are agent-driven only.** `PendingAction` requires a `WorkflowJob` (`jobId`), so proposals cannot be created outside an agent turn. Instead, the context builder tells the agent when case documents have facts that could fill empty client fields, and the agent calls `propose_client_update_from_document`.

## Review Focus

1. **A document re-uploaded with identical bytes but toggled off while a sibling with the same hash is on** — reads through the off document must refuse even though the shared content is `READY`. Test in Task 9.
2. **Concurrent identical uploads** (two dialog rows with the same file) — exactly one `DocumentContent` row and one queued job; neither upload fails. Test in Task 5.
3. **A version upload replaces the current version of an opted-in document** — the new content is ingested and the assistant reads the new version's content, not the old one. Test in Task 7.
4. **OCR noise in an ID card** (JMBG with a misread digit) — fails checksum and is dropped, never offered as a client update. Test in Task 3.
5. **Archived document with access on** — every tool refuses exactly like access off. Test in Task 9.

---

## Phase A — Schema and pure building blocks

### Task 1: Schema, migration, shared types

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261009090000_document_content/migration.sql`
- Modify: `libs/api/api-interfaces/src/lib/api-interfaces.ts`
- Modify: `delivery/tracks/case_document_ingestion_20261008/index.md` (link the plan)

**Interfaces:**
- Produces (Prisma): enums `DocumentContentStatus { PENDING EXTRACTING EMBEDDING CLASSIFYING READY FAILED UNSUPPORTED }`, `DocumentKind { ID_CARD PASSPORT APR_EXCERPT COURT_DECISION ADMIN_DECISION OTHER }`, `DocumentFactSubjectType { PERSON COMPANY DECISION }`; models `DocumentContent`, `DocumentContentChunk`, `DocumentFact` exactly as in the spec's data model; `DocumentVersion.contentId?`, `ChatAttachment.sha256?` + `contentId?`, `Document.aiAccess Boolean @default(false)`, `aiAccessChangedAt DateTime?`, `aiAccessChangedByUserId String?`; `StoredFile @@index([workspaceId, sha256])`.
- Produces (api-interfaces): `type DocumentAiStatus = "OFF" | "QUEUED" | "PROCESSING" | "READY" | "FAILED" | "UNSUPPORTED"`; `type DocumentKind = "ID_CARD" | "PASSPORT" | "APR_EXCERPT" | "COURT_DECISION" | "ADMIN_DECISION" | "OTHER"`; `DocumentSummary` gains `aiAccess: boolean; aiStatus: DocumentAiStatus; documentKind: DocumentKind | null; fromAssistantChat: boolean`; `interface BulkDocumentAiAccessRequest { documentIds: string[]; aiAccess: boolean }`; `interface BulkDocumentAiAccessResponse { updated: number }`.

- [ ] **Step 1:** Add the enums, models, and columns to `schema.prisma`. `DocumentContentChunk.embedding` is `Unsupported("vector(1024)")?`; `DocumentContent` has `@@unique([workspaceId, sha256])`; `DocumentFact` has `@@index([workspaceId, contentId])`; relations cascade from `DocumentContent` to chunks and facts; `DocumentVersion.contentId`/`ChatAttachment.contentId` are `onDelete: SetNull`.
- [ ] **Step 2:** Run `npx prisma migrate dev --create-only --name document_content --schema apps/api/prisma/schema.prisma`, rename the folder to `20261009090000_document_content`, and append: `CREATE INDEX "DocumentContentChunk_embedding_hnsw" ON "DocumentContentChunk" USING hnsw ("embedding" vector_cosine_ops);`
- [ ] **Step 3:** Run `npm run db:migrate`. Expected: "Your database is now in sync with your schema."
- [ ] **Step 4:** Add the api-interfaces types above. Run `npx tsc -p libs/api/api-interfaces/tsconfig.lib.json --noEmit`. Expected: no errors (the API build will fail until Task 7 maps the new fields — that is expected; keep this task's commit compiling by giving the mapper temporary values `aiAccess: false, aiStatus: "OFF", documentKind: null, fromAssistantChat: false` in `documents.service.ts`'s summary mapper).
- [ ] **Step 5:** Commit `feat(documents): document content schema and shared types`.

### Task 2: `@law/document-intelligence` — chunker and identifier validators

**Files:**
- Create lib: `libs/api/ai/document-intelligence/` (`project.json` name `document-intelligence`, tags `scope:ai`, `type:workflow`; copy `jest.config.cts`, `tsconfig*.json`, `eslint.config.mjs` from `libs/api/ai/workflows/case-timeline` adjusting paths); path alias `@law/document-intelligence` in `tsconfig.base.json`
- Create: `src/lib/chunker.ts`, `src/lib/identifiers.ts`, `src/index.ts`
- Test: `src/lib/chunker.spec.ts`, `src/lib/identifiers.spec.ts`

**Interfaces:**
- Produces: `interface TextChunk { ordinal: number; text: string; charStart: number; charEnd: number }`; `chunkText(text: string, options?: { size?: number; overlap?: number }): TextChunk[]` (defaults 1500/200); `isValidJmbg(value: string): boolean`; `jmbgBirthDate(value: string): string | null` (ISO `YYYY-MM-DD`); `isValidPib(value: string): boolean`; `isValidMb(value: string): boolean`; `digitsOnly(value: string): string`.

- [ ] **Step 1: Write failing tests.**
  - `chunkText`: empty → `[]`; text ≤ 1500 → one chunk `{ ordinal: 0, charStart: 0, charEnd: text.length }`; a 4,000-char text of paragraphs → every chunk ≤ 1500 chars, `text === source.slice(charStart, charEnd)`, consecutive chunks overlap by ≥ 1 and ≤ 200 chars, last `charEnd === text.length`; a chunk boundary falls on `\n\n` when one exists in the last 300 chars of the window.
  - `isValidJmbg("0101990710006")` true (compute a valid fixture with the mod-11 rule in the test helper); one digit changed → false; 12 digits → false; date part `3102...` → false.
  - `jmbgBirthDate` of a valid `DDMMYYY` with `YYY = 990` → `"1990-01-01"`; `YYY = 005` → `"2005-..."`.
  - `isValidPib`: valid 9-digit (ISO 7064 MOD 11,10 check digit) true; changed check digit false.
  - `isValidMb("12345678")` true; `"1234567"` false; letters false.
- [ ] **Step 2:** Run `npx nx test document-intelligence`. Expected: FAIL (modules not found).
- [ ] **Step 3:** Implement. JMBG: 13 digits `DDMMYYYRRBBBK`; `m = 11 - ((7(a1+a7)+6(a2+a8)+5(a3+a9)+4(a4+a10)+3(a5+a11)+2(a6+a12)) % 11)`; `K = m > 9 ? 0 : m`; year = `YYY < 800 ? 2000 + YYY : 1000 + YYY`; date must be a real calendar date. PIB: ISO 7064 MOD 11,10 over the first 8 digits.
- [ ] **Step 4:** Run `npx nx test document-intelligence`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(document-intelligence): chunker and Serbian identifier validators`.

### Task 3: `@law/document-intelligence` — classification and fact extraction

**Files:**
- Create: `src/lib/kinds.ts`, `src/lib/schema.ts`, `src/lib/prompts.ts`, `src/lib/quotes.ts`, `src/lib/runner.ts`, `src/lib/normalize.ts`
- Test: `src/lib/quotes.spec.ts`, `src/lib/normalize.spec.ts`, `src/lib/runner.spec.ts`

**Interfaces:**
- Consumes: Task 2 validators; `ChatModelProvider`, `FakeChatModelProvider` from `@law/llm`; `fold` semantics (case/script/diacritic-insensitive) — implement `foldForMatch(text: string): string` locally with `toLatin` + NFD diacritic strip + lowercase + whitespace collapse.
- Produces:
  - `const FACT_KINDS = ["ID_CARD","PASSPORT","APR_EXCERPT","COURT_DECISION","ADMIN_DECISION"] as const`; `FACT_FIELDS: Record<FactKind, readonly string[]>` exactly the spec's field lists (`representatives`/`parties` become repeated subjects, not fields).
  - `interface ExtractedFact { subjectKey: string; subjectType: "PERSON"|"COMPANY"|"DECISION"; subjectRole: string | null; field: string; value: string; normalizedValue: string | null; quote: string; charStart: number | null; confidence: number }`
  - `classifyDocument(provider: ChatModelProvider, text: string, minConfidence: number): Promise<{ kind: DocumentKind; confidence: number }>` — sends `text.slice(0, 4000)`; below `minConfidence` → `OTHER`.
  - `extractFacts(provider: ChatModelProvider, kind: FactKind, text: string): Promise<ExtractedFact[]>` — one structured call, then `normalizeFacts`.
  - `normalizeFacts(raw: RawFact[], text: string): ExtractedFact[]` — drops facts whose quote is not in the text (`locateQuote`), drops invalid identifiers, normalizes values; `field` must be in `FACT_FIELDS[kind]` plus `role` for subjects.
  - `locateQuote(text: string, quote: string): number | null` — offset in the original text or null.

- [ ] **Step 1: Write failing tests.**
  - `locateQuote("Ime: Петар\nPetrović", "ime: petar petrovic")` → `0`; absent quote → `null`.
  - `normalizeFacts`: a `jmbg` fact with a bad checksum is dropped; a `jmbg` fact with valid checksum keeps `normalizedValue` = 13 digits; a `pib` with spaces normalizes to 9 digits; `dateOfBirth` `"01.01.1990."` → normalizedValue `"1990-01-01"`; an unknown field is dropped; a fact whose quote is absent is dropped; a `jmbg` whose birth date disagrees with a `dateOfBirth` fact for the same subject drops the `jmbg`.
  - `classifyDocument` with `FakeChatModelProvider({ kind: "ID_CARD", confidence: 0.4 })` and threshold 0.6 → `{ kind: "OTHER", confidence: 0.4 }`; with 0.9 → `ID_CARD`; the prompt user message length ≤ 4,000 chars of document text.
  - `extractFacts` with a fake returning one valid and one fabricated-quote fact → one fact.
- [ ] **Step 2:** Run `npx nx test document-intelligence`. Expected: FAIL.
- [ ] **Step 3:** Implement schemas (zod) and prompts in Serbian Latin following `libs/api/ai/workflows/case-timeline/src/lib/{schema,prompts,runner}.ts`. The prompt instructs: copy quotes verbatim, never infer values not printed, `servedDate` only if printed.
- [ ] **Step 4:** Run `npx nx test document-intelligence`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(document-intelligence): document classification and verified fact extraction`.

## Phase B — Storage, content rows, ingestion

### Task 4: Stored-file byte dedup

**Files:**
- Modify: `libs/api/features/file-storage/src/lib/file.service.ts` (`commitAvailable`)
- Test: `apps/api/src/app/file.service.spec.ts`

**Interfaces:**
- Produces: `commitAvailable(params)` now returns `Promise<{ storedFileId: string }>` — the id the version must reference (existing file on a hash match).

- [x] **Step 1: Write failing tests** in `file.service.spec.ts`:
  - `"reuses an available stored file with the same hash"`: an existing `AVAILABLE` `StoredFile` (same workspace, same `sha256`, different id) → returns its id; the new `StoredFile` becomes `ABANDONED`, its `FileLocation` `FAILED`; the operation's `storedFileId`/`fileLocationId` point to the existing file and its active location; `adapter.delete(newStorageKey)` is called after the transaction.
  - `"does not dedup across workspaces"`: same hash in another workspace → returns the new id, nothing abandoned.
  - `"keeps the new file when no match exists"`.
- [x] **Step 2:** Run `npx nx test api --testPathPattern=file.service.spec`. Expected: FAIL.
- [x] **Step 3:** Implement inside `commitAvailable`: look up `storedFile.findFirst({ where: { workspaceId, sha256, lifecycle: "AVAILABLE", id: { not: operation.storedFileId } }, include: { locations: { where: { isActive: true, state: "AVAILABLE" }, take: 1 } } })`; on a match with an active location, run the dedup branch in the same `$transaction` and update `DocumentVersion.storedFileId` for `params.documentVersionId`; otherwise current behavior. Delete bytes best effort (log on failure).
- [x] **Step 4:** Update callers in `documents.service.ts` (`create`, `addVersion`) to ignore the return value (the version row is updated inside `commitAvailable`). Run `npx nx test api --testPathPattern="file.service|documents.service"`. Expected: PASS.
- [x] **Step 5:** Commit `feat(file-storage): reuse stored bytes for identical uploads`.

### Task 5: `@law/document-ingestion` — content service and queue port

**Files:**
- Create lib: `libs/api/features/document-ingestion/` (alias `@law/document-ingestion`; no `project.json`, like other features; specs live in `apps/api/src/app/`)
- Create: `src/lib/document-content.service.ts`, `src/lib/document-ingestion.queue.ts`, `src/lib/document-ingestion.types.ts`, `src/lib/document-ingestion.config.ts`, `src/lib/document-ingestion.module.ts`, `src/index.ts`
- Move: `libs/api/features/chat/src/lib/chat.storage.ts` → `libs/api/features/file-storage/src/lib/chat-attachment.storage.ts` as `ChatAttachmentStorage` (constructor reads `CHAT_UPLOAD_DIR` default `./tmp/chat-uploads`; identical layout and legacy fallback); export from `@law/file-storage`; replace `ChatStorageService` usages in chat with it
- Test: `apps/api/src/app/document-content.service.spec.ts`

**Interfaces:**
- Produces:
  - `const DOCUMENT_INGEST_QUEUE = "document-ingest"`; `interface DocumentIngestPayload { workspaceId: string; contentId: string }`
  - `DocumentIngestionQueue.enqueue(workspaceId: string, contentId: string): Promise<void>` — `queue.add("ingest", payload, { jobId: \`content:${contentId}\`, attempts: 3, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: true, removeOnFail: false })`.
  - `DocumentContentService.findOrCreate(input: { workspaceId: string; sha256: string; mimeType: string; sizeBytes: number }): Promise<{ id: string; status: DocumentContentStatus; pipelineVersion: number }>` — `upsert` on `workspaceId_sha256`, `update: {}`.
  - `DocumentContentService.requestIngestion(workspaceId: string, contentId: string): Promise<void>` — enqueue unless `READY` on `CURRENT_PIPELINE_VERSION`.
  - `DocumentContentService.ensureText(workspaceId: string, contentId: string): Promise<{ status: "COMPLETED" | "FAILED" | "UNSUPPORTED" | "UNAVAILABLE"; text: string | null }>` — returns stored text; when missing, extracts synchronously from bytes (Task 6's `readContentBytes`) and stores `extractedText`/`sourceScript`, leaving `status` for the pipeline.
  - `const CURRENT_PIPELINE_VERSION = 1` in `document-ingestion.types.ts`.
  - `DocumentIngestionModule` imports `BullModule.registerQueue({ name: DOCUMENT_INGEST_QUEUE })`, `FileStorageModule`; exports `DocumentContentService`, `DocumentIngestionQueue`.

- [x] **Step 1: Write failing tests:** `findOrCreate` calls `upsert` with `where: { workspaceId_sha256: { workspaceId, sha256 } }`; two concurrent calls for the same hash resolve to the same id (mock upsert returning the same row) and `requestIngestion` enqueues once per call with the same `jobId`; `requestIngestion` on a `READY` row with current pipeline version does not enqueue; on `READY` with `pipelineVersion: 0` enqueues; `ensureText` returns stored text without reading bytes.
- [x] **Step 2:** Run `npx nx test api --testPathPattern=document-content.service.spec`. Expected: FAIL.
- [x] **Step 3:** Implement. Move `BullModule.forRootAsync` from `ChatModule` into a new `QueueRootModule` in `libs/api/core/src/lib/queue-root.module.ts` (same Redis options), import it from `ChatModule` and `DocumentIngestionModule`. Register `DocumentIngestionModule` in `apps/api` `AppModule`.
- [x] **Step 4:** Run `npx nx test api --testPathPattern="document-content|chat"`. Expected: PASS.
- [x] **Step 5:** Commit `feat(document-ingestion): content rows keyed by hash and ingest queue`.

### Task 6: Ingestion processor and pipeline

**Files:**
- Create: `libs/api/features/document-ingestion/src/lib/document-ingestion.pipeline.ts`, `document-ingestion.processor.ts`, `document-content.events.ts`, `content-bytes.reader.ts`
- Test: `apps/api/src/app/document-ingestion.pipeline.spec.ts`

**Interfaces:**
- Consumes: Task 2/3 functions; `EmbeddingProvider`, `OpenRouterEmbeddingProvider`, `assertEmbeddingDimensions` from `@law/knowledge`; `extractAttachmentText` from `@law/extraction`; `MastraChatModelProvider`, `openRouterModel` from `@law/mastra`.
- Produces:
  - `DOCUMENT_EMBEDDING_PROVIDER` and `DOCUMENT_MODEL_PROVIDER` injection tokens (factories read `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`, `LEGAL_EMBEDDING_MODEL`).
  - `readContentBytes(workspaceId, contentId): Promise<{ buffer: Buffer; mimeType: string } | null>` — first a `DocumentVersion` with that `contentId` via `FileService.openDownload`, else a `ChatAttachment` via `ChatAttachmentStorage.read`.
  - `DocumentIngestionPipeline.run(workspaceId: string, contentId: string): Promise<void>` — steps per spec; each step persists `status` before work and results after; resume rule: skip extraction if `extractedText` present, skip embedding if chunk count > 0 with current `embeddingModel`, skip classification if `documentKind` set, skip facts if any `DocumentFact` exists or kind is `OTHER`.
  - `DocumentContentEvents` — `@Injectable` wrapping an rxjs `Subject<{ workspaceId: string; contentId: string; status: DocumentContentStatus }>` with `emit()` and `stream$`.
  - Processor `@Processor(DOCUMENT_INGEST_QUEUE)` runs the pipeline inside `WorkspaceContextService.run` with a system context (same pattern as `WorkflowProcessor`); on final failure sets `status: FAILED`, `failedStep`, `error` and emits.

- [ ] **Step 1: Write failing tests** with mocked prisma, fake embedding provider (returns 1024-length vectors), `FakeChatModelProvider`:
  - Happy path for an ID card: status transitions `EXTRACTING → EMBEDDING → CLASSIFYING → READY`; chunks inserted with `$executeRaw` vector literal; facts created; event emitted with `READY`.
  - Unsupported MIME → `UNSUPPORTED`, no embedding or model calls.
  - Embedding throws → error propagates (BullMQ retries); second run with `extractedText` present does not call `extractAttachmentText` again.
  - Classification throws → `READY` with no facts, warning logged.
  - Kind `OTHER` → no fact-extraction call.
  - Text longer than `DOCUMENT_EMBED_MAX_CHARS` → only the first N chars chunked, `truncated: true`.
- [ ] **Step 2:** Run `npx nx test api --testPathPattern=document-ingestion.pipeline.spec`. Expected: FAIL.
- [ ] **Step 3:** Implement. Embed in batches of 32. Insert chunks with `Prisma.sql` and `::vector` like `legal-knowledge.service.ts`. Replace chunks/facts in a transaction per step (delete-then-insert for the content id) so retries are idempotent.
- [ ] **Step 4:** Run the spec. Expected: PASS.
- [ ] **Step 5:** Commit `feat(document-ingestion): ingestion pipeline with resumable steps`.

## Phase C — Wiring documents and chat to content

### Task 7: Documents API — AI access, content linking, status

**Files:**
- Modify: `libs/api/features/workspace-documents/src/lib/documents.service.ts`, `documents.controller.ts`, `documents.dto.ts`, `documents.multipart.ts`, `workspace-documents.module.ts`
- Test: `apps/api/src/app/documents.service.spec.ts`

**Interfaces:**
- Consumes: `DocumentContentService`, `DocumentIngestionQueue` (Task 5).
- Produces:
  - `create(input)` accepts `aiAccess?: boolean` and replaces `initialText` with `contentId?: string` (chat promotion passes the attachment's content). Without `contentId`, it calls `findOrCreate` with the ingest result's `sha256`/`mimeType`/`sizeBytes`.
  - `addVersion` links the new version to content the same way and, if `aiAccess`, calls `requestIngestion`.
  - `setAiAccess(id: string, aiAccess: boolean): Promise<DocumentDetail>`; `setAiAccessBulk(body: BulkDocumentAiAccessRequest): Promise<BulkDocumentAiAccessResponse>` (max 200 ids, workspace-scoped, skips archived); `reprocess(id: string): Promise<DocumentDetail>` (only when content `FAILED`; otherwise 409).
  - Activity log actions `DOCUMENT_AI_ACCESS_ENABLED` / `DOCUMENT_AI_ACCESS_DISABLED`.
  - Routes: `PATCH /documents/ai-access` (declared before `PATCH /documents/:id`), `POST /documents/:id/ai-reprocess`; `aiAccess` multipart field (`"true"`/`"false"`) on `POST /documents`; `aiAccess` in `UpdateDocumentDto`.
  - Summary mapper: `aiStatus` = `OFF` if `!aiAccess`; else from current version's content: `PENDING`→`QUEUED`, `EXTRACTING|EMBEDDING|CLASSIFYING`→`PROCESSING`, others same name; no content → `QUEUED`. `documentKind` from content. `fromAssistantChat` = any `chatAttachments`.

- [ ] **Step 1: Write failing tests:** upload with `aiAccess: true` links content and enqueues; upload without it links content and does not enqueue; identical second upload reuses the same `contentId`; `setAiAccess(true)` on a `READY` content writes `DOCUMENT_AI_ACCESS_ENABLED` and does not enqueue; `setAiAccess(false)` writes `DOCUMENT_AI_ACCESS_DISABLED`; bulk skips archived and counts updated; `addVersion` on an opted-in document links new content, enqueues, and the summary's `aiStatus` reflects the new version (Review Focus 3); `reprocess` on non-failed → `ConflictException`; status mapping table.
- [ ] **Step 2:** Run `npx nx test api --testPathPattern=documents.service.spec`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test api --testPathPattern="documents|document-folders"`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(documents): per-document AI access and ingestion status`.

### Task 8: Chat attachments — hash, content, promotion

**Files:**
- Modify: `libs/api/features/chat/src/lib/chat.service.ts` (attachment save ~L697), `chat-document-promotion.service.ts`, `chat.module.ts`, `chat.events.ts`, `assistant-drafting.service.ts` (`attachmentText` ~L600–L670), `chat.mappers.ts`
- Create: `libs/api/features/chat/src/lib/document-content.listener.ts`
- Test: `apps/api/src/app/chat.service.spec.ts`, `apps/api/src/app/chat-document-promotion.service.spec.ts`

**Interfaces:**
- Consumes: `DocumentContentService`, `DocumentContentEvents`.
- Produces:
  - On save: `sha256 = createHash("sha256").update(file.buffer)`; `findOrCreate`; attachment row stores `sha256`, `contentId`; `requestIngestion` always.
  - Promotion calls `documents.create({ ..., contentId: attachment.contentId, aiAccess: true, source: "CHAT_ATTACHMENT" })`.
  - Chat SSE event `{ type: "document.content.updated"; workspaceId; sessionId; createdAt; attachmentIds: string[]; status: DocumentAiStatus }` added to the chat event union; `DocumentContentListener` subscribes to `DocumentContentEvents.stream$` and emits it to each session with attachments on that content.
  - Attachment summaries (`ChatAttachmentSummary`) gain `aiStatus: DocumentAiStatus`.
  - Drafting's attachment text path uses `DocumentContentService.ensureText`.

- [x] **Step 1: Write failing tests:** saving the same file twice in two sessions yields the same `contentId` and one `findOrCreate` result; promotion passes `contentId` and `aiAccess: true` and no `initialText`; listener emits `document.content.updated` only to sessions holding that content.
- [x] **Step 2:** Run `npx nx test api --testPathPattern="chat.service.spec|chat-document-promotion"`. Expected: FAIL.
- [x] **Step 3:** Implement.
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5:** Commit `feat(chat): attachments share hashed document content`.

## Phase D — Assistant

### Task 9: Access policy and content-backed reads

**Files:**
- Create: `libs/api/features/chat/src/lib/document-access.policy.ts`
- Delete: `libs/api/features/workspace-documents/src/lib/document-text.service.ts` and `apps/api/src/app/document-text.service.spec.ts` (replaced by `DocumentContentService.ensureText`; remove the export and provider)
- Modify: `libs/api/features/chat/src/lib/assistant-document-reads.service.ts` (`sources`, `namedDocument`, `textOf`, `attachmentText`, `toEntry`), `libs/api/ai/mastra/src/lib/assistant/tools/tool-deps.ts` (`AssistantDocumentEntry`), `legal-assistant.prompt.ts`
- Test: `apps/api/src/app/document-access.policy.spec.ts`, `apps/api/src/app/assistant-document-reads.service.spec.ts`

**Interfaces:**
- Produces:
  - `type AccessDecision = { readable: true; contentId: string | null } | { readable: false; reason: "AI_ACCESS_OFF" | "ARCHIVED" | "NOT_FOUND" }`
  - `DocumentAccessPolicy.forDocument(doc: { archivedAt: Date | null; aiAccess: boolean; currentVersion: { contentId: string | null } | null }): AccessDecision`; `forAttachment(att: { contentId: string | null; document: { archivedAt: Date | null; aiAccess: boolean } | null }): AccessDecision` — pure functions, exported.
  - `const AI_ACCESS_OFF_MESSAGE = (title: string) => \`Dokument „${title}" nije dostupan asistentu (AI pristup je isključen). Korisnik ga može uključiti u detaljima dokumenta.\``
  - `AssistantDocumentEntry` gains `aiAccess: "on" | "off"`; `AssistantDocumentRead`/`AssistantDocumentSearch` statuses gain `"AI_ACCESS_OFF"`.
  - `Source` gains `contentId` and `access: AccessDecision`; `textOf` reads via `DocumentContentService.ensureText`; `documentsByRef`, `documentsForTimeline`, `searchDocuments`, `readDocument` skip or refuse non-readable sources with `AI_ACCESS_OFF_MESSAGE`; `listDocuments` still lists them with `aiAccess: "off"`.
  - Prompt line: "Ako alat vrati AI_ACCESS_OFF, prenesi poruku korisniku i ne nagađaj sadržaj."

- [ ] **Step 1: Write failing tests:**
  - Policy matrix: doc on → readable; doc off → `AI_ACCESS_OFF`; doc archived + on → `ARCHIVED` (Review Focus 5); unfiled attachment → readable; filed attachment whose document is off → `AI_ACCESS_OFF`.
  - Reads: `readDocument` on an off doc returns `status: "AI_ACCESS_OFF"` and never calls `ensureText`; `listDocuments` includes it with `aiAccess: "off"`; two documents share one `contentId`, one on and one off — reading the off one refuses while the on one returns text (Review Focus 1); `documentsByRef` omits off docs and reports them as `NO_TEXT` with the off message; explicit `doc:<id>` of an off document refuses.
- [ ] **Step 2:** Run `npx nx test api --testPathPattern="document-access.policy|assistant-document-reads"`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Run `npx nx test api --testPathPattern="assistant-"` and `npx nx test mastra`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(assistant): strict per-document AI access for document reads`.

### Task 10: `search_case_documents` and `get_document_facts` tools

**Files:**
- Create: `libs/api/features/document-ingestion/src/lib/document-content.search.ts`, `libs/api/ai/mastra/src/lib/assistant/tools/search-case-documents.tool.ts`, `get-document-facts.tool.ts`
- Modify: `tool-deps.ts`, `side-effects.ts` (`search_case_documents: "none"`, `get_document_facts: "none"`), `legal-assistant.agent.ts`, `legal-assistant.prompt.ts`, `tool-call-summary.ts`, `libs/api/features/chat/src/lib/assistant-tools.adapter.ts`, `assistant-document-reads.service.ts`
- Test: `apps/api/src/app/document-content.search.spec.ts`, `apps/api/src/app/assistant-document-reads.service.spec.ts`, `libs/api/ai/mastra/src/lib/assistant/tools/tool-call-summary.spec.ts`

**Interfaces:**
- Produces:
  - `DocumentContentSearch.searchChunks(workspaceId: string, contentIds: string[], query: string, limit: number): Promise<Array<{ contentId: string; ordinal: number; text: string; charStart: number; charEnd: number; score: number }>>` — embeds the query, cosine over chunks `WHERE "workspaceId" = $1 AND "contentId" = ANY($2) AND "embeddingModel" = LEGAL_EMBEDDING_MODEL`, `limit ≤ 12`.
  - `DocumentContentSearch.factsFor(workspaceId: string, contentIds: string[]): Promise<DocumentFactRow[]>`.
  - Tool deps: `searchCaseDocuments(scope, { query: string; ref?: string }): Promise<{ status: "OK"; hits: Array<{ n: number; ref: string; title: string; text: string; charStart: number; charEnd: number; score: number }>; notIndexed: string[] } | { status: "NO_DOCUMENTS"; message: string }>`; `getDocumentFacts(scope, { ref?: string }): Promise<{ status: "OK"; subjects: Array<{ ref: string; title: string; documentKind: DocumentKind; subjectKey: string; subjectType: string; subjectRole: string | null; facts: Array<{ field: string; value: string; quote: string; confidence: number }> }>; conflicts: Array<{ field: string; values: Array<{ value: string; ref: string }> }>; notIndexed: string[] }>`.
  - Conflict rule: same `subjectType` and folded name (or same `jmbg`/`mb`) across documents with different `normalizedValue ?? value` for one field.
  - Prompt routing: "Pitanja o sadržaju → search_case_documents; tačan broj, naziv ili citat → search_documents; lični i matični podaci stranaka → get_document_facts."

- [ ] **Step 1: Write failing tests:** search only receives `contentIds` of readable sources; a hit maps back to the right `ref` and gets `n` numbering; contents not `READY` are listed in `notIndexed`; facts grouped by subject; two documents for the same person with different JMBGs → one `conflicts` entry with both values; off documents never reach `factsFor`.
- [ ] **Step 2:** Run `npx nx test api --testPathPattern="document-content.search|assistant-document-reads"`. Expected: FAIL.
- [ ] **Step 3:** Implement and register both tools on the agent.
- [ ] **Step 4:** Run `npx nx test api --testPathPattern="assistant-|document-content"` and `npx nx test mastra`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(assistant): semantic case-document search and document facts tools`.

### Task 11: Facts in drafting

**Files:**
- Modify: `libs/api/ai/workflows/brief-extraction/src/lib/context.ts`, `prompts.ts`, `normalize.ts`; `libs/api/features/chat/src/lib/assistant-drafting.service.ts`; `libs/api/api-interfaces/src/lib/api-interfaces.ts` (brief party field source); Case-work pane component in `apps/web/src/app/features/assistant/` (source label)
- Test: `libs/api/ai/workflows/brief-extraction/src/lib/*.spec.ts`, `apps/api/src/app/assistant-drafting.service.spec.ts`

**Interfaces:**
- Produces: `BriefContextInput.documentFacts?: Array<{ ref: string; title: string; subjectType: string; subjectRole: string | null; field: string; value: string }>`; brief party values filled from a fact carry `source: { ref: string; title: string }` in the brief result; prompt rule: chat-typed values override facts; a field with a fact is not a placeholder.

- [x] **Step 1: Write failing tests:** drafting passes facts from readable case documents (not from off documents) into the brief context; the brief prompt contains the facts block; normalization keeps the `source` for a party JMBG that matches a fact and drops it when the model invents a source not in `documentFacts`.
- [x] **Step 2:** Run `npx nx test brief-extraction` and `npx nx test api --testPathPattern=assistant-drafting`. Expected: FAIL.
- [x] **Step 3:** Implement; show "Izvor: {title}" next to sourced party fields in the Case-work pane (translation key `assistant.caseWork.factSource`).
- [x] **Step 4:** Rerun both. Expected: PASS.
- [x] **Step 5:** Commit `feat(assistant): prefill brief party data from document facts`.

### Task 12: Client update proposals

**Files:**
- Modify: `libs/api/features/chat/src/lib/assistant-actions.service.ts` (`normalize`, `execute`), `assistant-context.builder.ts`, `tool-deps.ts` (`AssistantActionRequest`), `side-effects.ts` (`propose_client_update_from_document: "confirm"`), `legal-assistant.agent.ts`, `tool-call-summary.ts`
- Create: `libs/api/ai/mastra/src/lib/assistant/tools/propose-client-update.tool.ts`, `libs/api/features/chat/src/lib/client-fact-match.ts`
- Test: `apps/api/src/app/client-fact-match.spec.ts`, `apps/api/src/app/assistant-actions.service.spec.ts`, `apps/api/src/app/assistant-context.builder.spec.ts`

**Interfaces:**
- Produces:
  - `AssistantActionRequest` adds `{ type: "update_client_from_document"; documentRef: string; subjectKey: string }`.
  - `matchClientFields(client: ClientFieldSnapshot, subject: { subjectType: string; facts: Array<{ field: string; value: string; normalizedValue: string | null; quote: string }> }): { matched: boolean; fill: Array<{ field: ClientFillField; value: string; quote: string }>; conflicts: Array<{ field: ClientFillField; current: string; found: string }> }` where `ClientFillField = "jmbg" | "firstName" | "lastName" | "registrationNumber" | "taxNumber" | "address" | "identificationDocument"`. Person match: folded first+last name equal, or `client.jmbg === fact jmbg`. Company match: `registrationNumber` or `taxNumber` equal.
  - `normalize` for the new type: the document must be readable, linked to exactly one client, and `matched`; otherwise `InvalidProposal` with a Serbian reason. Payload `{ clientId, documentId, fill }`; summary `Dopuna podataka klijenta {displayName} iz dokumenta „{title}"`; details list each field, value, and quote.
  - `execute`: re-reads the client; writes only fields still empty (identification document → creates `ClientIdentificationDocument` only if none with that number exists; address → creates a `ClientAddress` only if the client has none); writes activity log with `AI_SOURCE` metadata; result lists applied and skipped fields.
  - Context builder: when the session's case client has empty fill fields and readable `READY` documents have a matching subject, add one line "Dokumenti predmeta sadrže podatke koji mogu dopuniti klijenta (propose_client_update_from_document)."

- [x] **Step 1: Write failing tests:** match by name with diacritics/script differences; no match for opposing party; empty `jmbg` → in `fill`; existing different `jmbg` → in `conflicts`, not `fill`; proposal on an off document → `InvalidProposal`; document linked to two clients → `InvalidProposal`; execute skips a field filled between proposal and approval; context hint appears only when there is something to fill.
- [x] **Step 2:** Run `npx nx test api --testPathPattern="client-fact-match|assistant-actions|assistant-context"`. Expected: FAIL.
- [x] **Step 3:** Implement; render the approval card with the existing pending-action UI (details lines only — no new component).
- [x] **Step 4:** Rerun. Expected: PASS.
- [x] **Step 5:** Commit `feat(assistant): propose client updates from document facts`.

## Phase E — Data migration

### Task 13: Backfill, reindex, seed

**Files:**
- Create: `scripts/backfill-document-content.ts`, `scripts/reindex-document-content.ts`
- Create: `delivery/tracks/case_document_ingestion_20261008/followup-drop-legacy-text.sql` (follow-up migration body; not applied in this track)
- Modify: `package.json` (`documents:backfill-content`, `documents:reindex-content`), `apps/api/prisma/seed-demo-data.cjs`
- Test: `scripts/backfill-document-content.spec.ts` (run through the `api` jest project or a plain `tsx --test`; follow `scripts/legal-corpus-format.ts` conventions)

**Interfaces:**
- Produces:
  - `backfillDocumentContent(prisma: PrismaClient, deps: { readStoredFile(workspaceId, storedFileId): Promise<Buffer>; readChatAttachment(row): Promise<Buffer> }): Promise<{ versionsLinked: number; attachmentsLinked: number; contentsCreated: number; textCopied: number; documentsOptedIn: number }>` — idempotent; uses `StoredFile.sha256` when present, hashes bytes otherwise; copies `extractedText`/`sourceScript` (status `COMPLETED` → content keeps `PENDING` but text present; `UNSUPPORTED` → `UNSUPPORTED`); sets `aiAccess = true` on documents referenced by a `ChatAttachment.documentId`.
  - `reindex` CLI: `--only-opted-in` (default) enqueues `requestIngestion` for content of `aiAccess = true` documents and of chat attachments; `--pipeline-version` forces rows below `CURRENT_PIPELINE_VERSION`.

- [x] **Step 1: Write failing tests:** two versions with the same hash → one content; second run changes nothing (all counters 0); chat-promoted document becomes `aiAccess = true`; other documents stay `false`; existing text copied without any provider call.
- [x] **Step 2:** Run the test. Expected: FAIL.
- [x] **Step 3:** Implement; seed adds four documents on one demo case: two `aiAccess: true` (one ID card text fixture with `READY` content and facts inserted directly), two `false`.
- [x] **Step 4:** Run the test (PASS), then `npm run db:seed:demo` and `npm run documents:backfill-content` twice locally; second run prints all zeros.
- [x] **Step 5 (scoped by controller ruling):** Write `followup-drop-legacy-text.sql` (drops `extractionStatus`, `extractedText`, `sourceScript`, `extractionError`, `extractedAt` from `DocumentVersion` and `ChatAttachment`) and remove all remaining code reads of those columns (`chat.service.ts` ~L1407, promotion, drafting). Run `npx nx test api`. Expected: PASS. Commit `feat(documents): backfill and reindex document content`. _Done: SQL file written; code reads of the legacy columns are intentionally kept (Task 8/9 fallbacks protect deployments where backfill has not run) and are removed together with the follow-up migration._

## Phase F — Frontend

### Task 14: API client and upload dialog

**Files:**
- Modify: `libs/shared/frontend/api-clients/src/lib/api-clients.ts` (`DocumentsApiClient`), `apps/web/src/app/features/documents/document-upload-modal/document-upload.models.ts`, `document-upload.queue.ts` (`createBody`), `document-upload-dialog.component.{ts,html}`, translation files under `apps/web/public/i18n/` (or the project's existing location)
- Test: `document-upload.queue.spec.ts`, `document-upload-dialog` spec if present

**Interfaces:**
- Produces: `DocumentsApiClient.setAiAccess(id: string, aiAccess: boolean): Observable<DocumentDetail>`, `setAiAccessBulk(body: BulkDocumentAiAccessRequest): Observable<BulkDocumentAiAccessResponse>`, `reprocessAi(id: string): Observable<DocumentDetail>`; `DocumentUploadRow.aiAccess: boolean`; queue `setAiAccess(id, value)` and `setAllAiAccess(value)`; translation keys `documents.ai.access`, `documents.ai.accessTooltip`, `documents.ai.status.{OFF,QUEUED,PROCESSING,READY,FAILED,UNSUPPORTED}`, `documents.ai.kind.{ID_CARD,PASSPORT,APR_EXCERPT,COURT_DECISION,ADMIN_DECISION,OTHER}`, `documents.ai.enableSelected`, `documents.ai.disableSelected`, `documents.ai.confirmDisable`, `documents.ai.fromChat`, `documents.ai.reprocess`.

- [ ] **Step 1: Write failing tests:** `createBody` appends `aiAccess` = `"true"` when the row is on and `"false"` otherwise; new rows default to the dialog-level value which defaults to `false`; `setAllAiAccess(true)` updates every non-uploaded row; frozen retry payload keeps the original value.
- [ ] **Step 2:** Run `npx nx test web --testPathPattern=document-upload`. Expected: FAIL.
- [ ] **Step 3:** Implement: dialog header `HlmSwitch` labeled `documents.ai.access` with `HlmTooltip` showing `documents.ai.accessTooltip`; per-row switch in each row.
- [ ] **Step 4:** Rerun. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): AI access switch in the upload dialog`.

### Task 15: Documents list, detail, bulk actions

**Files:**
- Modify: `apps/web/src/app/features/documents/documents.component.{ts,html}` (also rendered on the case Documents tab)
- Create: `apps/web/src/app/features/documents/document-ai-status.component.ts`
- Test: `apps/web/src/app/features/documents/documents.component.spec.ts`, `document-ai-status.component.spec.ts`

**Interfaces:**
- Produces: `DocumentAiStatusComponent` (`input.required<DocumentAiStatus>()`, renders a lucide icon + `HlmSpinner` for `QUEUED`/`PROCESSING` + tooltip `documents.ai.status.*`); `DocumentsComponent.enableAiSelected()`, `disableAiSelected()`, `toggleDetailAi(value: boolean)` (confirms with `documents.ai.confirmDisable` via the existing confirmation dialog before turning off); polling `effect` that reloads the current page and the open detail every 5,000 ms while any visible row or the detail has `aiStatus` `QUEUED`/`PROCESSING`, cleared on destroy or when none remain.

- [x] **Step 1: Write failing tests:** status icon per status; bulk enable calls `setAiAccessBulk` with selected file ids only (folders excluded) and refreshes; disabling from detail asks for confirmation and does nothing on cancel; polling starts with a processing row and stops after it becomes `READY` (fake timers); detail shows kind label and `documents.ai.fromChat` when `fromAssistantChat`; `FAILED` shows a reprocess button calling `reprocessAi`.
- [x] **Step 2:** Run `npx nx test web --testPathPattern="documents.component|document-ai-status"`. Expected: FAIL.
- [x] **Step 3:** Implement with Spartan Helm primitives and semantic tokens.
- [x] **Step 4:** Rerun. Expected: PASS.
- [x] **Step 5:** Commit `feat(web): document AI status, detail switch, and bulk actions`.

### Task 16: Chat attachment status

**Files:**
- Modify: assistant attachment chip component and SSE handler under `apps/web/src/app/features/assistant/` (the component rendering `ChatAttachmentSummary`), `libs/api/api-interfaces` chat event union
- Test: the chip component spec and the SSE store spec

**Interfaces:**
- Consumes: `ChatAttachmentSummary.aiStatus`, SSE `document.content.updated` (Task 8).

- [ ] **Step 1: Write failing tests:** chip shows `DocumentAiStatusComponent` for its `aiStatus`; an SSE `document.content.updated` updates the matching attachments' status in the store without a refetch.
- [ ] **Step 2:** Run `npx nx test web --testPathPattern=assistant`. Expected: FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** Rerun. Expected: PASS.
- [ ] **Step 5:** Commit `feat(web): attachment ingestion status in chat`.

## Phase G — Close-out

### Task 17: Verification, docs, track status

**Files:**
- Modify: `.github/bussiness-logic-done-so-far.md` (Workspace documents, Assistant document tools — remove "There are no embeddings over office documents."), `delivery/tracks/case_document_ingestion_20261008/{plan.md,metadata.json,index.md}`, `.env.example` (`DOCUMENT_KIND_MIN_CONFIDENCE`, `DOCUMENT_EMBED_MAX_CHARS`)

- [ ] **Step 1:** Run `npx nx run-many -t lint -p api web document-intelligence mastra brief-extraction`. Expected: no errors.
- [ ] **Step 2:** Run `npx nx run-many -t test -p api web document-intelligence mastra brief-extraction`. Expected: PASS.
- [ ] **Step 3:** Run `npx nx run-many -t build -p api web`. Expected: success.
- [ ] **Step 4:** Manual check with `npm run services:up`, `api:serve`, `web:serve`: upload the same ID-card image twice with AI on (one `DocumentContent`, one `StoredFile` with bytes); turn one off and ask the assistant for the JMBG — it refuses for that document; ask for a tužba draft on the case — party JMBG filled with "Izvor".
- [ ] **Step 5:** Update the business-logic doc and `.env.example`, tick every box in this plan, set `metadata.json` `status: "completed"` and `updated_at`, link the plan in `index.md`. Commit `docs: case document ingestion done`.
