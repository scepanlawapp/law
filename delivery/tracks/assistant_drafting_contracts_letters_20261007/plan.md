# Assistant Drafting: Contracts, Letters, Corporate Acts — Plan

- [x] Add the new type ids to `DRAFT_DOCUMENT_TYPES` in `@law/api-interfaces`.
- [x] Add the 9 new registry entries.
- [x] Family evidence wording and per-field urgent descriptions (registry); use them in the brief prompt and the matter link.
- [x] DOCX title and file name from the document type (`@law/documents`, `chat.service` export).
- [x] Agent prompt: drop the hard-coded type list; ask which side the office represents for contracts.
- [x] Web:
  - [x] Evidence group heading by family.
  - [x] Starter cards.
  - [x] Type and role i18n.
- [x] Tests:
  - [x] Registry invariants.
  - [x] Prompts for a contract, a letter and a corporate act.
  - [x] Matter-link wording.
  - [x] DOCX title and file name.
  - [x] Web cards.
- [x] Update `.github/bussiness-logic-done-so-far.md` and the epic track.
- [ ] Manual check in the running app: one contract, one letter and one corporate act, each drafted, reviewed and exported to DOCX. Then set the status to completed.

## Verification results (2026-10-07)

- `brief-extraction`, `drafting`, `legal-grounding`, `triage`, `mastra`, `documents`: all tests pass, and typecheck and lint are clean.
- API: 483 tests pass and 2 fail. The 2 failures (SEF UBL XSD, `FILE_STORAGE_ROOT` env) also fail on `main` without these changes.
- Web: all 71 assistant tests pass. i18n check: all 23 starter cards, 14 types and 22 party roles have strings in Serbian and English. Lint errors in `apps/web` were already there before this track.
- Fixed a Phase 1 gap: DOCX export no longer hard-codes the "Tužba" title and the `tuzba-` file name.
- While testing: employment contracts get the contract form rules but not the venue clause, because labour-dispute jurisdiction follows the law.
