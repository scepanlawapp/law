# Assistant Case Summary and Timeline — Specification

## What

- **Agent tool.** `summarize_case_documents { documentRefs?, focus? }`.
  - **Document set:** the same set `list_documents` uses, i.e. the non-archived documents of the conversation's case plus chat attachments not filed yet. `documentRefs` narrows it to the named documents.
  - **Limits:** at most 20 documents. At most 24,000 characters per document, read in windows of 12,000 characters.
- **Mastra workflow `case-timeline` (map, then reduce):**
  1. **Extract.** One structured call per document window (three in parallel). Each returns dated events with a title, a description, a short quote, an event kind, and a one-sentence document summary. The source document is attached in code, never taken from the model.
  2. **Merge in code (deterministic):**
     - Dates are validated as `YYYY-MM-DD`, `YYYY-MM` or `YYYY`; anything else becomes undated and keeps the date as written.
     - A quote is kept only if it really appears in the source text (ignoring case, script, diacritics and spacing).
     - Duplicates (same date and title) are merged.
     - Events are sorted chronologically, with undated events last.
  3. **Summarize.** One structured call over the document summaries and the merged events. It returns a case summary, open questions, and warnings, and cannot add events or dates.
- **Event kinds:** `FILING`, `DECISION`, `HEARING`, `CORRESPONDENCE`, `CONTRACT`, `PAYMENT`, `DEADLINE`, `OTHER`.
- **Document status:**
  - Each document is marked read, truncated, or without text.
  - Documents beyond the limit are listed as skipped.
  - A document whose extraction call fails is reported, and the rest continue.
- **Persistence.** `DocumentAnalysis` with `kind = CASE_TIMELINE`.
  - `documentRef` is `case:<caseId>`, or `session:<sessionId>` without a case.
  - `contractType` becomes nullable, through a migration.
- **API contract.** `DocumentAnalysisResponse` becomes a union by `kind` (`CONTRACT_REVIEW` or `CASE_TIMELINE`).
- **Read-only.** No records change and nothing is proposed.
- **Web:**
  - The "Analiza" tab renders the latest analysis of either kind. The timeline panel shows the summary, the open questions, the events grouped by year (date, kind, title, description, quote, source document), and the document list with statuses.
  - Starter card: a case card ("Hronologija predmeta") on case-linked conversations. There is no general card with a case picker, because a picked case is only named in the prompt, not linked to the conversation.
  - The case's Assistant tab shows the latest timeline (date, summary excerpt, number of events) with a link that opens that conversation (`/assistant?sessionId=`).

## Why

Lawyers and trainees reread whole case files to answer "what happened when". A sourced chronology with verified quotes saves that time, and it does so without inventing dates.

## Out of scope

- DOCX export of the timeline.
- Deadlines from documents (Phase 5).
- Embeddings over office documents.
