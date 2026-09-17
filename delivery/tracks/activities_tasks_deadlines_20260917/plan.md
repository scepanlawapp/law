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

## Remaining API work

- Make update DTOs genuinely partial and preserve omitted fields.
- Consume and validate calendar cursors across pages; the current endpoint returns a continuation marker but does not yet apply it as an input boundary.
- Complete the legacy read facade that merges ClientActivity/CaseActivity with Note/ActivityLog without duplicates, and mark legacy manual writes deprecated.
- Add transition and calendar integration tests, activity metadata redaction tests, and migration/backfill tests.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
