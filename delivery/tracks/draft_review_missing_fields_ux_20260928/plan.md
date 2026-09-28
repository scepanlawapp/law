# Plan

## Track scaffolding

- [x] Create branch `draft_review_missing_fields_ux_20260928` from `origin/main`.
- [x] Write `index.md`, `spec.md`, `plan.md`, `metadata.json`; register in `delivery/index.md`.

## Contract & normalization

- [x] `api-interfaces`: `BRIEF_MISSING_FIELD_KEYS`, `BriefMissingField`, `BriefEvidenceItem`; update `BriefResult`, brief/draft/preview DTOs; extend `BriefTaskProposal` (`fieldKey`, `priority`, `dueDate`, `selectedByDefault`) and `BriefTaskApplyItem.dueDate`.
- [x] `brief-extraction`: `normalizeMissingFields` / `normalizeEvidence` (legacy aliases, humanize fallback); schema uses them via `z.preprocess`.
- [x] Use normalizers in `matter-link.service.ts`, `chat.mappers.ts`, `assistant-drafting.service.ts`, mastra tool deps; evidence consumers use `.label`.

## Schema, prompts, migration

- [x] Brief prompt: allowed keys, Serbian labels, `provided` evidence; JSON template.
- [x] Drafting prompt: warnings only for ambiguities/contradictions/risks.
- [x] Prisma migrations: `BriefExtractionResult.missingFields` → `jsonb` (`20260928120000_brief_missing_fields_json`), then `NOT NULL` (`20260928120100_brief_missing_fields_not_null`).
- [x] Fix "Tuzbeni" → "Tužbeni" in `suggestDescription`.

## Task proposals (backend)

- [x] Action titles per key, readable descriptions, provided evidence excluded.
- [x] Due date (+3 working days / next working day for `serviceDate`), priority, `selectedByDefault`.
- [x] Keys `missing:<fieldKey>:<index>`; legacy `missing:<index>` still counts as applied.
- [x] `applyTasks` passes `dueDate` + `priority`.

## Frontend

- [x] `briefFieldLabel` helper + `assistant.briefField.*` i18n (ser/eng); matter-link card uses it.
- [x] `findPlaceholders` util; draft panel "Za dopunu" checklist (jump, fill, zero state), "Napomene", status icon, hide decisions when approved.
- [x] Approve / DOCX confirmation while placeholders remain.
- [x] Matter-link tasks: groups + select all, preselection, Hitno badge, editable due date, created rows as done, count in submit, translated error.

## Tests & docs

- [x] Specs: normalizer, matter-link service, placeholders util, draft panel, matter-link component; fixture updates.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
- [x] Mark plan and metadata completed.

## Notes

- The agent's draft tool result keeps `missingFields: string[]`, now the human labels.
- Pre-existing lint errors (`app-` selector on the matter-link component, documents and sidebar templates) are untouched.
