# Draft Approval Gate Plan

- [~] Prisma: `DraftApprovalStatus` enum; `DraftResult` fields `approvalStatus`, `finalDocumentText`, `reviewedByUserId`, `reviewedAt`, `reviewNote`, `previousDraftId`; migration created and applied locally.
- [~] `DraftResultResponse` gains the new fields; add `DraftUpdateDto`, `DraftReviewDto { note?: string }`; SSE `draft.updated` event type in `ChatStreamEvent`.
- [x] Chat service list/get/update/approve/reject/request-changes operations, workspace scoping, audit-event writes, and request-changes job regeneration are implemented locally.
- [x] `@law/drafting`: `buildDraftingUserPrompt` accepts optional `{ previousDraft, reviewerNote }` feedback section.
- [x] Controller routes for draft listing, editing, approval, rejection, and change requests are implemented with workspace and lawyer-role guards.
- [x] Frontend API methods, dedicated `draft-review-panel` component, warnings/missing-field display, Latin/Cyrillic server-side toggle, assistant-page wiring, and Serbian/English i18n keys are implemented locally.
- [~] Focused service and prompt coverage passes (`23/23` chat-service tests; `7/7` drafting tests). Add dedicated state-transition, RBAC/controller, and request-changes queue assertions.

## Status convention

`[ ]` not started, `[~]` implemented locally or partially complete, `[x] <7-character commit>` completed and committed.
