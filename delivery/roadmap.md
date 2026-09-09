# AI Legal Workflow Optimization Roadmap

Date: 2026-09-09. Scope: the `law` monorepo (NestJS API, Angular web, Prisma/PostgreSQL, Tesseract OCR, OpenRouter LLM). Every finding below was verified against the code, not the README.

## 1. Current State Analysis

### What works

| Capability                                                                                                     | Location                                 | Verdict                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Authenticated, workspace-scoped chat with uploads (≤5 files) and SSE streaming                                 | `libs/api/features/chat`                 | Solid. Cookie sessions, CSRF origin guard, rate limiting, audit events. |
| Portir triage (LEGAL / NON_LEGAL / UNCLEAR)                                                                    | `libs/api/ai/workflows/triage`           | Real LLM call, structured output.                                       |
| Attachment text extraction: PDF text layer, DOCX, XLS/XLSX, TXT, image OCR (`eng`+`srp`+`srp_latn`)            | `libs/api/ai/extraction`                 | Real, on-prem, per-attachment failure isolation.                        |
| Brief extraction → `BriefResult` (parties, court, claim, basis, evidence, relief, `missingFields`, confidence) | `libs/api/ai/workflows/brief-extraction` | Real, Zod-validated, prompt budgets tracked.                            |
| Drafting → ZPP tužba draft with `[UNOS POTREBAN: …]` placeholders, persisted as `DraftResult`                  | `libs/api/ai/workflows/drafting`         | Real, auto-chained when `jobType === "lawsuit"`.                        |

### Where billable time is still being wasted

1. **No approval surface.** The draft exists only as `GET /chat/jobs/:jobId/draft`. A lawyer must copy JSON out of an API response, paste into Word, reformat, and transliterate by hand. That is 20–40 minutes of non-billable work per tužba that the system already drafted.
2. **No quality gate before the human.** `evaluation` and `review` workflows return the literal strings `"evaluation"` / `"review"`. Every draft, including ones with hallucinated facts or a missing tužbeni zahtev, reaches the lawyer unfiltered — so the lawyer re-reads the brief to check the draft. The critic loop should do that.
3. **Scanned PDFs are silently empty.** `pdf-extractor.ts` reads the text layer only. A scanned presuda (the most common input in Serbian practice) yields `""`, the brief comes back mostly `missingFields`, and a human re-types facts.
4. **No case memory.** `template-retrieval` is a stub and Qdrant is interface-only. Every draft is written from scratch; the firm's own historical podnesci are never reused.
5. **No domain model.** There is no `Matter`, `Client`, `Party`, or `Deadline` table. The Cases / Clients / Calendar / Notifications pages are mock data. Nothing produced by the pipeline can be tracked, billed, or followed up automatically.
6. **Fire-and-forget orchestration.** `runTriage → runBriefExtraction → runDrafting` are `void promise.catch()` calls inside the request process. An API restart loses in-flight jobs; there are no retries; `WorkflowJob.status = QUEUED` is a label, not a queue.
7. **Zero external ingestion.** Nothing arrives except what a human pastes into the chat. Court mail, eSanduče notifications, and case status changes are all read by people.

### Script risk (Cyrillic / Latin) — CRITICAL

- There is **no transliteration code anywhere** in the repository (`translit`, `cyril`, `ćirilica`, `latinica` all grep-negative).
- OCR returns whichever script the page uses. A Cyrillic presuda and a Latin ugovor about the same parties produce `extractedText` in two scripts. Once Qdrant is wired, "Београд" and "Beograd" become distant vectors and exact filters miss half the corpus.
- Draft output is Latin only because the prompt says so. Courts require Cyrillic for podnesci. Today the lawyer converts by hand or relies on Word — another manual step, and one that routinely corrupts `Lj/Nj/Dž` digraphs.
- Party/case-number matching (needed for Portal Pravosuđa and inbox ingestion) will fail without a normalized key.

### Privacy posture

Chat completions go to OpenRouter (`gpt-4o-mini`). Brief text, party names and attachment contents leave the premises. The `ChatModelProvider` abstraction exists, so this is a configuration problem, not an architectural one — but it must be made explicit and reversible. Embeddings for RAG **must** be local from day one; there is no acceptable cloud path for a vector store of the firm's entire case history.

## 2. Aggressive Optimization Proposals

| #   | Human touchpoint removed                                           | Replacement                                                                                                                                                                                                                            | Track                                     |
| --- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| 1   | Manual Latin↔Cyrillic conversion; manual normalisation of OCR text | `@law/transliteration` middleware: normalise every ingested text to Latin before persistence/embedding/prompting; transliterate to Cyrillic on draft read/export.                                                                      | `script_normalization_20260909`           |
| 2   | Re-typing facts from scanned PDFs                                  | Rasterise + OCR fallback when the text layer is below a character threshold.                                                                                                                                                           | `script_normalization_20260909`           |
| 3   | Lost jobs on restart; no retries                                   | BullMQ (Redis) `workflow` queue. Processors per workflow. Retries with backoff, idempotency on `correlationId`.                                                                                                                        | `workflow_queue_bullmq_20260909`          |
| 4   | Copy/paste from API to Word                                        | Draft review panel in the assistant UI: warnings + missing fields, inline edit, Latin/Cyrillic toggle, **1-click Approve / Reject / Request changes**. Approval state machine + audit trail on `DraftResult`.                          | `draft_approval_gate_20260909`            |
| 5   | Manual formatting                                                  | DOCX export (`docx` package) in Latin or Cyrillic, ZPP structure, court-ready typography.                                                                                                                                              | `draft_export_docx_20260909`              |
| 6   | Lawyer proof-reads every draft against the brief                   | Critic loop: structured LLM evaluation (ZPP čl. 192 mandatory elements, no facts outside the brief, court/party consistency, relief matches claim). Auto-iterate drafting ≤ N times; only `READY_FOR_SIGNOFF` drafts reach the lawyer. | `evaluation_critic_loop_20260909`         |
| 7   | Drafting from scratch every time                                   | Qdrant RAG over firm templates + every approved draft (flywheel). Local `bge-m3` embeddings via Ollama. Script-agnostic because all content is Latin-normalised at ingestion.                                                          | `template_retrieval_qdrant_20260909`      |
| 8   | Manually creating case files after intake                          | Auto-create `Matter`, `Client`, `MatterParty` from an approved `BriefResult`.                                                                                                                                                          | `matter_domain_model_20260909`            |
| 9   | Lawyer polls the system                                            | Notification model + SSE + email: ready-for-sign-off, blocking evaluation issues, deadline T-3/T-1, case status change.                                                                                                                | `notifications_20260909`                  |
| 10  | Reading court mail, computing deadlines                            | n8n IMAP → API webhook → existing pipeline + `court-decision-parsing` workflow (type, court, case number, delivery date → statutory `Deadline` rows).                                                                                  | `inbox_ingestion_n8n_20260909`            |
| 11  | Checking Tok predmeta by hand                                      | Scheduled poller per `Matter`; diff → `CaseStatusEvent` → notification.                                                                                                                                                                | `portal_pravosudja_status_20260909`       |
| 12  | Manual invoicing                                                   | eFaktura (SEF) UBL 2.1 issuance from matter time entries.                                                                                                                                                                              | `efaktura_integration_20260909`           |
| 13  | Looking up PIB / matični broj / address of the defendant           | APR lookup step after brief extraction; eKatastar deep-link/lookup for real-estate matters.                                                                                                                                            | `party_enrichment_apr_ekatastar_20260909` |

Remaining human touchpoint after all tracks: **one click per draft** (sign-off), plus strategy and courtroom work.

## 3. Integration with Serbian Legal Infrastructure & Script Compliance

Canonical internal script is **Serbian Latin**. Everything stored, embedded, or prompted is Latin. Conversion to Cyrillic happens only at the outbound edge.

| System                                | Direction | Access method                                                                                                                                                   | Outbound script                                                     | Automation                                                                            |
| ------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Sudovi / podnesci (court submissions) | Out       | DOCX export → lawyer files via portal or in person                                                                                                              | **Cyrillic** (mandatory)                                            | `toCyrillic()` on export; digraph-safe; placeholders and article citations preserved. |
| Portal Pravosuđa — Tok predmeta       | In        | No public API. HTTP fetch of public case search; Playwright fallback if JS-rendered. Conservative daily schedule, per-matter opt-in, `MANUAL_CHECK` on captcha. | Query terms in **Cyrillic** (court names as the portal spells them) | BullMQ repeatable job → diff → `CaseStatusEvent`.                                     |
| eSanduče / eUprava                    | In        | No API. Notification emails forwarded to a firm mailbox → n8n IMAP trigger → `POST /integrations/inbox`. PDFs OCR'd, transliterated to Latin, classified.       | n/a (inbound)                                                       | Full pipeline + deadline computation.                                                 |
| eFaktura (SEF)                        | Out       | Official REST API (sandbox `demoefaktura.mfin.gov.rs`), API key per firm.                                                                                       | UBL 2.1 XML — script-neutral; free-text fields sent Latin           | Invoice issuance from `Matter` time entries; status webhook/poll.                     |
| APR                                   | In        | No public API for search. HTML fetch with fallback to `missingFields`.                                                                                          | Query in **Latin or Cyrillic** — try Latin, retry Cyrillic          | `party-enrichment` step fills PIB, MB, seat address.                                  |
| eKatastar (RGZ)                       | In        | Public viewer, no API. MVP: deep-link + paste; later automated fetch.                                                                                           | Cyrillic municipality names                                         | Only when `jobType`/facts involve real estate.                                        |
| CEOP                                  | —         | Out of scope for 90 days (construction permits; rarely relevant to litigation drafting).                                                                        | —                                                                   | —                                                                                     |

Script handling rules (enforced in code, not prompts):

1. `extractAttachmentText` → `toLatin()` → persist `extractedText` + `sourceScript`.
2. User message text → `toLatin()` before any prompt is built.
3. Case numbers, party names and court names are normalised to Latin for matching keys.
4. `GET …/draft?script=cyrillic` and DOCX export apply `toCyrillic()` at read time; `documentText` stays Latin in the DB.
5. Foreign proper nouns / URLs / emails / Latin-only tokens are protected from Cyrillic conversion.

## 4. Architectural & Tech Stack Recommendations

- **Orchestration:** BullMQ inside NestJS (`@nestjs/bullmq`, Redis). One `workflow` queue, one processor per `WorkflowName`. `WorkflowJob` remains the source of truth; BullMQ job id = `WorkflowJob.id`. n8n is reserved for what it is good at — external triggers (IMAP, webhooks) — and posts into the API, never into the DB.
- **Event bus:** Keep `ChatEventBus` (RxJS) for now; add a Redis pub/sub adapter when the API runs more than one instance.
- **LLM:** Keep `ChatModelProvider` as the seam. OpenRouter stays the default for completions in this window; add `OllamaChatModelProvider` behind `LLM_PROVIDER` and log a PII warning on boot when a remote provider is active. Add a separate `EmbeddingProvider` interface implemented **only** by local Ollama (`bge-m3`, multilingual, strong on Serbian).
- **Vector store:** Qdrant, collection `legal-templates`, payload `{workspaceId, docType, source, chunkIndex, script:"latin"}`, filter on `workspaceId` always. Chunk ~800 chars with 100 overlap on paragraph boundaries. Ingest firm templates via upload endpoint and every `APPROVED` draft automatically.
- **Transliteration:** Pure TypeScript lib, no dependency. Table-driven with digraph handling (`lj/nj/dž`, all-caps `LJ/NJ/DŽ`, mixed-case `Lj/Nj/Dž`), exception list for known Latin-only sequences (`ZPP`, `ZOO`, `čl.`, `st.`, `tač.`, URLs, emails, `[UNOS POTREBAN: …]` markers).
- **OCR:** Tesseract.js already on-prem. Add `pdfjs-dist` + `@napi-rs/canvas` rasterisation for scanned PDFs, page cap via env.
- **Documents:** `docx` for generation. PDF via LibreOffice headless container only if lawyers need PDF (deferred).
- **Domain:** `Client`, `Matter`, `MatterParty`, `Deadline`, `CaseStatusEvent`, `Notification`, `Invoice`/`TimeEntry` in Prisma. `ChatSession` and `DraftResult` get an optional `matterId`.
- **Security:** Every new endpoint under `AuthGuard` + `WorkspaceAccessGuard`; approval actions restricted to `LAWYER/ADMIN/OWNER`; integration webhooks authenticated with `N8N_WEBHOOK_TOKEN` and resolved to a workspace by mailbox mapping, never by payload trust; all external fetches allow-listed by host.

## 5. Implementation Phases (Next 90 Days)

- **Phase 1 (Quick Wins, weeks 1–4):** central transliteration pipeline + scanned-PDF OCR (`script_normalization_20260909`); BullMQ queue (`workflow_queue_bullmq_20260909`); approval state machine + review panel (`draft_approval_gate_20260909`); DOCX export in Cyrillic/Latin (`draft_export_docx_20260909`); repo hygiene (orphan spec, README, `.env.example`).
- **Phase 2 (Core Logic, weeks 5–8):** critic loop (`evaluation_critic_loop_20260909`); Qdrant RAG with local embeddings (`template_retrieval_qdrant_20260909`); Matter/Client/Party/Deadline domain and real Cases/Clients pages (`matter_domain_model_20260909`); notifications (`notifications_20260909`).
- **Phase 3 (Full Autonomy, weeks 9–13):** n8n inbox ingestion + court-decision parsing (`inbox_ingestion_n8n_20260909`); Portal Pravosuđa poller (`portal_pravosudja_status_20260909`); eFaktura issuance (`efaktura_integration_20260909`); APR/eKatastar enrichment (`party_enrichment_apr_ekatastar_20260909`); optional Ollama completions flag.

Each track lives under `delivery/tracks/<track_id>/` with `spec.md`, `plan.md`, `metadata.json`.
