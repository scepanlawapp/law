# Plan

- [x] Register this track in `delivery/index.md`.
- [x] Prisma: nullable `caseId` on `ChatSession` and `DraftResult`; `opposingPartyName` and `opposingPartyAddress` on `Case`; `appliedCaseId` and `appliedTaskKeys` on `BriefExtractionResult`.
- [x] Shared contracts for session case link, brief preview/apply, and task preview/apply.
- [x] Chat service: create/link session to a workspace case; copy `caseId` onto new drafts; do not move `APPROVED` drafts on relink.
- [x] Brief preview and apply: match or create plaintiff, create case through existing case rules, opposing party as text, idempotent apply.
- [x] Task preview and apply: only after a case is linked; subset confirm; no due date; no duplicates.
- [x] Case context block on answering and drafting when the session is linked.
- [x] Assistant UI: case picker, `caseId` query param without auto-send, client/case card, task card.
- [x] Case detail: open assistant, list linked sessions and drafts.
- [x] Activity log metadata `AI_ASSISTED` on confirmed creates.
- [x] Tests for link, apply idempotency, and task subset.
- [x] Update `.github/bussiness-logic-done-so-far.md`.
