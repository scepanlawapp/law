# Assistant Contract Review — Plan

## Contracts and data
- [x] `@law/api-interfaces`:
  - [x] Review types and `DocumentAnalysisResponse`.
  - [x] `analyses` on the session detail.
  - [x] The `analysis.updated` event.
- [x] Prisma `DocumentAnalysis` model and migration; update the demo seed if it touches chat data.

## AI
- [x] `@law/contract-review` library: checklists, schema, prompts, runner, grounding queries, memo markdown.
- [x] Mastra `contract-review` workflow.
- [x] `review_contract` tool:
  - [x] Deps and side-effect entry.
  - [x] Tool summaries.
  - [x] Agent prompt.

## API
- [x] `AssistantContractReviewService`: run, persist, emit, list for session.
- [x] Session detail includes analyses; DOCX export endpoint with an audit event.
- [x] Tools adapter wiring.

## Web
- [x] Contract-review panel component.
- [x] Rail generalized to draft, matter and analysis tabs.
- [x] SSE handling.
- [x] Export.
- [x] Starter card.
- [x] i18n.

## Verification and docs
- [x] Tests:
  - [x] Library: checklists, prompts, schema, markdown.
  - [x] Workflow.
  - [x] Tool.
  - [x] Service.
  - [x] Export.
  - [x] Panel.
  - [x] Rail.
- [x] Update `.github/bussiness-logic-done-so-far.md` and the epic track.
- [x] MANUAL: review an NDA and an employment contract, then export the memo.

## Verification results (2026-10-07)

- `contract-review` (new), `mastra`, `brief-extraction`, `drafting`, `legal-grounding`, `triage`, `documents`: all tests pass, and typecheck and lint are clean.
- API: 490 tests pass and 2 fail. The 2 failures (SEF UBL XSD, `FILE_STORAGE_ROOT` env) also fail on `main` without these changes. New specs cover the `AssistantContractReviewService` and the analysis export.
- Web: all 78 assistant tests pass, including the review panel and the three-tab rail. The 4 lint problems in `apps/web` were already there. i18n: all 24 starter cards and every review key have strings in Serbian and English.
- Migration `20261007120000_document_analysis` was generated with `prisma migrate diff`. The demo seed creates no chat data, so it needs no change.
