# Plan: Assistant time capture, billing answers, and undo

## Track
- [x] Branch `assistant_time_billing_undo_20261015`
- [x] Track files and `delivery/index.md` link

## Foundation
- [x] Shared "run as the conversation owner" helper

## Day work
- [x] `get_day_work` read tool over the time review
- [x] `log_work_entries` action (Auto → PROPOSED, Manual → card)
- [x] Prompt rules; "Upiši današnji rad" starter; card link to the time review

## Billing
- [x] `AssistantBillingReadsService`, `get_client_billing`, `list_receivables`
- [x] Per-section NOT_ALLOWED from the owner's permissions

## Undo
- [x] Migration: `PendingAction.undoneAt`, `undoneByUserId`
- [x] `POST /chat/pending-actions/:id/undo` per action type; previous event time stored on reschedule
- [x] Card undo button and state; agent told about undone saves

## Verification
- [x] API, Mastra, and web specs
- [x] Lint and typecheck
- [x] Manual end-to-end in chat
- [x] Docs: `.github/bussiness-logic-done-so-far.md`
