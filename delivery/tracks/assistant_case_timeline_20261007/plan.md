# Assistant Case Summary and Timeline — Plan

## Contracts and data
- [x] `@law/api-interfaces`:
  - [x] Timeline types.
  - [x] `DocumentAnalysisResponse` as a union by kind.
  - [x] `latestTimeline` on the case links.
- [x] Migration: `DocumentAnalysis.contractType` becomes nullable.

## AI
- [x] `@law/case-timeline` library:
  - [x] Schemas, prompts and runners (extract and summarize).
  - [x] Windowing.
  - [x] Date normalization, quote verification, merge and sort.
- [x] Mastra `case-timeline` workflow.
- [x] `summarize_case_documents` tool:
  - [x] Deps, side effect and summaries.
  - [x] Agent prompt.

## API
- [x] Document reads: all readable session/case documents with text (capped).
- [x] `AssistantCaseTimelineService` (run, persist, emit); adapter wiring; mapper by kind.
- [x] Case links include the latest timeline.

## Web
- [x] Timeline panel.
- [x] Rail renders the analysis by kind.
- [x] `?sessionId=` deep link.
- [x] Case Assistant tab card.
- [x] Starter cards.
- [x] i18n.

## Verification and docs
- [x] Tests:
  - [x] Library: dates, quotes, merge, windows, prompts.
  - [x] Workflow (including a failing document).
  - [x] Tool.
  - [x] Service.
  - [x] Case links.
  - [x] Panel.
  - [x] Rail.
  - [x] Deep link.
- [x] Update `.github/bussiness-logic-done-so-far.md` and the epic track.
- [x] MANUAL: a case with several documents, then the timeline from the case page.

## Verification results (2026-10-07)

- `case-timeline` (new), `contract-review`, `mastra`, `brief-extraction`, `drafting`, `legal-grounding`, `triage`, `documents`: all tests pass, and typecheck and lint are clean.
- API: 499 tests pass and 2 fail. The 2 failures (SEF UBL XSD, `FILE_STORAGE_ROOT` env) also fail on `main` without these changes. New specs cover:
  - the timeline service
  - `documentsForTimeline`
  - the latest timeline on the case links
  - refusing to export a timeline
- Web: all 88 assistant and cases tests pass. They cover the timeline panel, the analysis pane by kind, and the `?sessionId=` deep link. The case-page card has no component test, because the existing case-detail spec stubs the template; the API test covers its data. The 4 lint problems in `apps/web` were already there. i18n: all 35 starter cards and every timeline key have strings in Serbian and English.
- Migration `20261007150000_document_analysis_timeline` makes `contractType` nullable.
- Change from the spec: there is no general "case picker" timeline card, because a picked case is only named in the prompt, not linked to the conversation.
