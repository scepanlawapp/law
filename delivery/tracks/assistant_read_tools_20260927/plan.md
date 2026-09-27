# Assistant Read Tools — Plan

- [x] Track files and index link.
- [x] Turn scope carries the sender (`userId`, `userDisplayName`) from the session creator; the prompt names the current user.
- [x] `tool-deps.ts`: DTOs and deps for `searchClients`, `getClient`, `searchCases`, `listWorkItems`, `getAgenda`, `listActivity`; enriched case facts.
- [x] Tools `search_clients`, `get_client`, `search_cases`, `list_work_items`, `get_agenda`, `list_activity`, registered on the agent, side effect `none`.
- [x] Tool-call summaries (labels and counts) and web i18n labels.
- [x] Prompt rules for office data; `LEGAL_ASSISTANT_MAX_STEPS` 6 → 8.
- [x] `AssistantOfficeReadsService` (delegated from `AssistantToolsAdapter`): person and reference resolvers, workspace guard helper, mapping, caps, and truncation over `ClientsService`, `CasesService`, and `ActivitiesTasksDeadlinesService`.
- [x] Tests: mastra tool/agent/summary specs; office-reads, context-builder, and runner specs.
- [x] Update `.github/bussiness-logic-done-so-far.md`; mark the track completed.

## Notes

- The office reads live in `AssistantOfficeReadsService` (chat feature). `AssistantToolsAdapter` delegates to it and returns `UNAVAILABLE` when it is missing.
- The sender comes from `ChatSession.createdByUserId` through `AssistantContextBuilder.currentUser`. Queued drafting jobs carry `userId: null`.
- Live end-to-end check against the running app with an LLM key: done by the user on 2026-09-27 (deadlines this week, colleague agenda, client search, open work on the linked case, case activity); all fine.
