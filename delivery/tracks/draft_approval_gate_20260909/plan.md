# Draft Approval Gate Plan

- [ ] Prisma: `DraftApprovalStatus` enum; `DraftResult` fields `approvalStatus`, `finalDocumentText`, `reviewedByUserId`, `reviewedAt`, `reviewNote`, `previousDraftId`; migration.
- [ ] `DraftResultResponse` gains the new fields; add `DraftUpdateDto`, `DraftReviewDto { note?: string }`; SSE `draft.updated` event type in `ChatStreamEvent`.
- [ ] `DraftService` (in `libs/api/features/chat`): list/get/update/approve/reject/requestChanges with role checks and `AuditEvent` writes; `requestChanges` creates a new `drafting` `WorkflowJob` with feedback input.
- [ ] `@law/drafting`: `buildDraftingUserPrompt` accepts optional `{ previousDraft, reviewerNote }` feedback section.
- [ ] Controller routes; workspace scoping via draft's `workspaceId`.
- [ ] Angular `DraftApiClient` methods in `libs/shared/frontend/api-clients`; `draft-review-panel` component (ts/html/scss) with signals; wire into assistant page on `job.updated` for `drafting` jobs; i18n keys.
- [ ] Tests: state transitions and RBAC; request-changes enqueues drafting with feedback; controller 403 for `MEMBER` approve.

## Status convention

`[ ]` not started, `[~]` in progress, `[x] <7-character commit>` completed.
