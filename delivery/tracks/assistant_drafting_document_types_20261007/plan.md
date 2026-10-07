# Assistant Drafting Document Types — Plan

## Contracts
- [x] `@law/api-interfaces`:
  - [x] Add `DRAFT_DOCUMENT_TYPES`, `DraftDocumentType` and the v2 `BriefResult` (parties, fields).
  - [x] Widen `BriefMissingField.key` to a string.
  - [x] Add `documentType` to the brief and draft responses.
  - [x] Generalize the parties in `BriefApplyPreview`.

## Registry and brief
- [x] `document-types.ts` registry with LAWSUIT, STATEMENT_OF_DEFENCE, APPEAL, ENFORCEMENT_MOTION, SUBMISSION.
- [x] v2 brief schemas: the LLM output schema, plus the stored result with `documentType`.
- [x] `normalizeBrief()` for v1 rows; per-type missing-key normalization.
- [x] `buildBriefSystemPrompt(type)`; the runner takes the type.

## Drafting and grounding
- [x] `buildDraftingSystemPrompt(type)`; the user prompt header names the type; the runner takes the type.
- [x] `buildDraftGroundingQueries` reads v2 fields.

## Mastra
- [x] Rename the workflow to `document-drafting` (input `documentType`) and remove the jobType bail.
- [x] Replace the `draft_lawsuit` tool with `draft_document`, and rename `draftLawsuit` to `draftDocument` in the deps.
- [x] Update the agent prompt, the tool summaries and the triage DRAFT wording.

## API
- [x] Prisma migration: `documentType` on `BriefExtractionResult` and `DraftResult`.
- [x] `assistant-drafting.service`: documentType, `documentRefs`, always create the drafting job, persist the type.
- [x] Add `documentType` to the draft mappers.
- [x] `matter-link.service`: client party by role, registry task titles, normalized reads.

## Web
- [x] Generic parties and client switch in the matter link.
- [x] Field-label fallback.
- [x] Type label in the draft panel.
- [x] Starter cards.
- [x] i18n entries.

## Verification and docs
- [x] Tests: brief-extraction, drafting, legal-grounding, mastra, api, web.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [ ] Manual check in the running app (tužba parity, žalba from a filed judgment, old draft still opens), then set the status to completed.

## Verification results (2026-10-07)

- `brief-extraction`, `drafting`, `legal-grounding`, `mastra`: all tests pass.
- API: `assistant-drafting.service`, `matter-link.service`, `agent-turn.runner` and `chat.service` specs pass. In the full API suite, 480 tests pass and 2 fail: `SEF UBL validation` and `validateEnvironment … FILE_STORAGE_ROOT`. Both also fail on `main` without these changes.
- Web: all 70 assistant tests pass. Lint errors in `apps/web` (the `app-` selector prefix, the sidebar button) were already there before this track.
- Lint passes for `drafting`, `mastra`, `brief-extraction`, `legal-grounding`, `api` and `api-interfaces`.
- Manual check with a running app and model is not done yet: tužba parity, žalba from a filed judgment, and opening an old draft.
