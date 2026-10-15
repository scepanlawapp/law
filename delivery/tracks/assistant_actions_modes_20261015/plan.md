# Plan: Assistant actions on permission modes

## Track
- [x] Branch `assistant_actions_modes_20261015` from `assistant_permission_modes_20261015`
- [x] Track files and `delivery/index.md` link

## Framework
- [x] Per-action mode policy replaces `MODE_AWARE_ACTIONS`; unsupported mode → card
- [x] `propose(..., { forceCard })` used by deadline detection
- [x] Generic `completeForm` validating the body per action type
- [x] Contracts: new `PendingActionType`s, `prefill` union, `resultEntityType`

## Actions
- [x] `log_work_entry` tool, normalize, execute (Auto → PROPOSED)
- [x] `create_task` tool, normalize, execute
- [x] `reschedule_event` / `cancel_event` tools, event lookup, execute
- [x] `create_deadline` on Manual/Ask
- [x] `link_case`, `create_tasks_from_brief` on Ask/Auto
- [x] `update_client_from_document` on Ask/Auto (conflicts → card)

## Web
- [x] Task and deadline dialogs accept `initial` + `save`; event dialog `save` in edit mode
- [x] Assistant `openForm` / `openResult` dispatch by kind; card wording
- [x] Generic `completePendingAction` API client; i18n

## Verification
- [x] API actions spec, Mastra agent spec, web specs
- [x] Lint and typecheck
- [x] Manual end-to-end in chat per mode
- [x] Docs: `.github/bussiness-logic-done-so-far.md`
