# Assistant Deadline from Document — Plan

## Track
- [x] Track files and index link; branch `assistant_deadline_from_document_20261007`.
- [x] Check the periods against the consolidated ZPP, ZIO, ZUP and ZUS, and the holidays law.

## Library `@law/legal-deadlines`
- [x] Calendar:
  - [x] Orthodox Easter.
  - [x] Non-working days, including the Sunday shift.
  - [x] Working-day check.
- [x] Rules table by act kind and procedure.
  - [x] Each rule has a remedy, days, legal basis, deadline type and notes.
  - [x] Include the cases with no rule.
- [x] `computeDeadline`: day after service, add the days, shift past non-working days, and record the steps.
- [x] Classification: schema, prompt (document is data; quotes verbatim) and runner.
- [x] Interpretation: verify the quotes, choose the service date, check the period against the remedy instruction, and produce the outcome.

## Mastra
- [x] `deadline-detection` workflow (classify, then compute).
- [x] `detect_deadlines` tool:
  - [x] Deps and result type.
  - [x] Side effect `confirm`.
  - [x] Call summary.
  - [x] Agent registration and prompt.

## API
- [x] `AssistantDeadlineDetectionService`:
  - [x] Read the document.
  - [x] Run the workflow.
  - [x] Handle each outcome: needs date, none, expired, propose through `AssistantActionsService`.
- [x] Adapter wiring and module providers.

## Web
- [x] Starter cards (general and case) with i18n.

## Verification and docs
- [x] Tests:
  - [x] Calendar (Easter dates, holiday shifts).
  - [x] Compute.
  - [x] Rules.
  - [x] Interpretation.
  - [x] Workflow.
  - [x] Tool.
  - [x] Service.
  - [x] Starter cards.
- [x] Update `.github/bussiness-logic-done-so-far.md` and the epic track.
- [ ] MANUAL: attach a judgment, ask for the žalba deadline, give the service date, check the card, and approve it.
