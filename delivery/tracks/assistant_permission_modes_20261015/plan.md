# Plan: Assistant Permission Modes

- [x] Track files and `delivery/index.md` link
- [x] Prisma: `AssistantPermissionMode`, `PendingActionMode`, `UserSettings.assistantPermissionMode`, `ChatSession.permissionMode`, `PendingAction.mode` + migration
- [x] Shared contracts: permission mode, `create_event` action type, `PendingActionSummary.mode/eventPrefill/resultEntityId`, complete-event request
- [x] User settings DTO/service: default mode
- [x] Chat session DTO/service: per-session override
- [x] Mastra `create_event` tool, side-effects map, agent registration, prompt line, proposal result variants
- [x] `AssistantActionsService`: `create_event` normalization (time, participants, case, conflicts)
- [x] `AssistantActionsService.propose`: effective mode, FORM / CARD / AUTO paths (AUTO runs as session owner)
- [x] Executor `create_event` branch + `completeForm` + `POST /chat/pending-actions/:id/complete`
- [x] Agent runner: FORM_REQUIRED waits, decision note mentions user edits
- [x] Web: event dialog prefill + complete via chat API
- [x] Web: pending-action card variants (FORM / AUTO)
- [x] Web: composer mode select, settings select, translations
- [x] Tests (API, mastra, web) and targeted lint/build
- [x] Docs: `.github/bussiness-logic-done-so-far.md`, metadata status
- [x] Manual end-to-end check in the running app (Ask / Manual / Auto / Auto with overlap)
