# Draft Approval Gate Specification

## Goals

- Add an approval state machine to `DraftResult`: `approvalStatus` (`DRAFT | READY_FOR_SIGNOFF | APPROVED | REJECTED | CHANGES_REQUESTED`), `finalDocumentText?`, `reviewedByUserId?`, `reviewedAt?`, `reviewNote?`. New drafts start as `READY_FOR_SIGNOFF` until the evaluation track exists (then evaluation decides).
- Endpoints (all `AuthGuard` + `WorkspaceAccessGuard`, approval actions restricted to `LAWYER | ADMIN | OWNER`):
  - `GET chat/sessions/:sessionId/drafts` — list drafts for a session.
  - `PATCH chat/drafts/:draftId` — save edited `finalDocumentText` (Latin canonical; if the client sends Cyrillic it is normalized with `toLatin`).
  - `POST chat/drafts/:draftId/approve | reject | request-changes` with optional `note`.
- `request-changes` enqueues a new `drafting` job whose prompt includes the previous draft and the reviewer note as feedback; the new `DraftResult` links to the previous one via `previousDraftId`.
- Every transition writes an `AuditEvent` (`draft.approved`, `draft.rejected`, `draft.changes_requested`, `draft.edited`) and emits an SSE `draft.updated` event.
- Angular: `draft-review-panel` component in `apps/web/src/app/features/assistant/components/` — Material card showing warnings and `missingFields` chips, editable textarea, Latin/Cyrillic view toggle (server-side `?script=`), Approve / Reject / Request changes buttons with confirmation dialog for reject. Text via existing `TranslatePipe` keys in `public/i18n/ser.json` and `eng.json`.

## Non-goals

- Multi-signer workflows.
- DOCX export (next track) — the panel will link to it once available.
- Evaluation/critic loop (Phase 2).

## Users

Lawyers (`LAWYER`, `ADMIN`, `OWNER`) approve; `MEMBER`s can view and edit but not approve.
