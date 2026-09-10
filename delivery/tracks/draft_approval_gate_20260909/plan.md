# Draft Approval Gate Plan

- [x] `6c37c90` Prisma: `DraftApprovalStatus` enum; `DraftResult` fields `approvalStatus`, `finalDocumentText`, `reviewedByUserId`, `reviewedAt`, `reviewNote`, `previousDraftId`; migration created and applied locally.
- [x] `6c37c90` `DraftResultResponse` gains the new fields; added `DraftUpdateDto`, `DraftReviewDto { note?: string }`, and the SSE `draft.updated` event type.
- [x] `6c37c90` Chat service list/get/update/approve/reject/request-changes operations, workspace scoping, audit-event writes, and request-changes job regeneration.
- [x] `6c37c90` `@law/drafting` accepts optional `{ previousDraft, reviewerNote }` feedback in `buildDraftingUserPrompt`.
- [x] `6c37c90` Controller routes for draft listing, editing, approval, rejection, and change requests with workspace and lawyer-role guards.
- [x] `6c37c90` Frontend API methods, dedicated `draft-review-panel`, warnings/missing-field display, Latin/Cyrillic server-side toggle, assistant-page wiring, and Serbian/English i18n keys.
- [x] `6c37c90` Focused coverage: `24/24` chat-service tests and `7/7` drafting tests; web and API lint passed.

## Status convention

`[ ]` not started, `[~]` implemented locally or partially complete, `[x] <7-character commit>` completed and committed.
