# Activities, Tasks, and Deadlines Implementation Plan

- [x] Add Prisma enums for Event, Task, Deadline, and Note state/type values.
- [x] Add workspace-scoped Event, EventAssignee, EventClient, and EventAttendee models.
- [x] Add workspace-scoped Task and Deadline models with optional case/client relationships.
- [x] Add workspace-scoped Note and ActivityLog models.
- [x] Generate and apply the `activities_tasks_deadlines` Prisma migration.
- [x] Add shared API contracts and validated NestJS DTOs.
- [~] Add create/list/update APIs for events, tasks, deadlines, and notes.
- [~] Add automatic ActivityLog emission and user-facing activity queries.
- [~] Add calendar projection queries over dated records.
- [ ] Migrate existing ClientActivity and CaseActivity consumers and data.
- [x] Replace the Tasks & Deadlines route placeholder with URL-backed Tasks and Deadlines tabs.
- [x] Connect server-paginated task/deadline lists, workspace-user references, contextual links, filters, empty/error states, and explicit transitions.
- [x] Reuse the existing TaskDialog, DeadlineDialog, WorkManagementApiClient, confirmation dialog, toast, and shared date formatting utilities.
- [x] Preserve date-only task/deadline values and clear inactive due-target fields when switching modes.
- [ ] Add case/client detail integrations, reusable notes lists, and client activity history integration.
- [~] Add focused tests for relationship validation and date semantics.
- [x] Run the API build and existing API test suite.

## Current implementation boundary

The initial database migration intentionally preserves `ClientActivity` and `CaseActivity` so existing API consumers remain operational. Their replacement/unification is a later compatibility migration and must include data mapping and deprecation sequencing.

## Implemented API checkpoint

The `activities-tasks-deadlines` feature library now exposes guarded routes for:

- Events: list, get, create, update, complete, cancel.
- Tasks: list, get, create, update, complete, cancel, reopen.
- Deadlines: list, get, create, update, satisfy, cancel, reopen.
- Notes: list, get, create, update.
- Calendar: bounded range projection over overlapping Events and dated Tasks/Deadlines.
- Activity log: paginated read endpoint; no public write endpoint.

Workspace context and actor identity come from `WorkspaceContextService`. Mutations validate workspace references, case/client consistency, active workspace users, event ranges, due-target rules, and attendee contact scope. ActivityLog creation is transactional with supported creates, updates, and transitions. Task completion does not satisfy a linked deadline.

## Verification results

- `CI=1 NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false npx nx build api --skip-nx-cache` — passed, exit status 0.
- `CI=1 NX_TASKS_RUNNER_DYNAMIC_OUTPUT=false npx nx test api --runInBand` — passed, 14 suites / 73 tests, exit status 0.
- `NX_TUI=false npx nx build web --skip-nx-cache` — Angular compilation passed for the work-management page and dialogs; overall exit status 1 because existing production budgets fail (initial bundle 1.26 MB vs 1.00 MB and assistant stylesheet 10.35 kB vs 8.00 kB).
- No focused frontend tests exist yet for the new Tasks & Deadlines page; this remains follow-up work.

## Remaining API work

- Task/deadline list services accept inherited `search` query fields in the shared client/DTO shape but currently do not apply search or date filters in Prisma; the new UI forwards search for compatibility but cannot honestly provide server-side search until the service implements it.
- Task/deadline status filters accept one enum value only, so a single request cannot express both `TODO` and `IN_PROGRESS` as an exact open-work quick view. The current quick view uses the supported `TODO` filter and this limitation must be resolved before claiming a complete open-status view.
- Task/deadline list responses contain IDs but not expanded case/client/user display records; the frontend loads bounded reference lists for labels and links, which is not a complete solution for workspaces exceeding that reference page size.
- Make update DTOs genuinely partial and preserve omitted fields.
- Consume and validate calendar cursors across pages; the current endpoint returns a continuation marker but does not yet apply it as an input boundary.
- Complete the legacy read facade that merges ClientActivity/CaseActivity with Note/ActivityLog without duplicates, and mark legacy manual writes deprecated.
- Add transition and calendar integration tests, activity metadata redaction tests, and migration/backfill tests.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
