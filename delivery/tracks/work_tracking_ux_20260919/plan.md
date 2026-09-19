# Work-Tracking UX Implementation Plan

- [x] Extend backend query contracts: `assigneeUserIds`/`responsibleUserIds`/`userIds`, `statuses`, `sourceTypes`, `includeNoDueDate` on the Task/Deadline/Event list and Calendar DTOs (`activities-tasks-deadlines.dto.ts`), accepted as repeated query keys via a `toArray` transform.
- [x] Wire `search` (title/description, case-insensitive `contains`) and `from`/`to` due-date-range filters into `listTasks`/`listDeadlines`/`listEvents`, which previously accepted these fields but silently ignored them.
- [x] Rework `listTasks`/`listDeadlines`/`listEvents`/`calendar()` where-clauses around an `AND: conditions[]` builder supporting multi-status (`IN`) and multi-person (`IN`/`OR`) filters, keeping the original single-value fields for backward compatibility.
- [x] Add `assigneeUserIds: string[]` to the `CalendarItem` contract (`api-interfaces.ts`) so calendar List/Board can show all event assignees, not just the organizer.
- [x] Add `EventsApiClient.list()/get()/complete()` to the shared frontend API client (only `create/update/cancel` existed before), plus extended `TaskListQuery`/`DeadlineListQuery`/`CalendarQuery` and a new `EventListQuery` type.
- [x] Build the shared `WorkView` standalone component (`apps/web/src/app/features/work-management/work-view/`):
  - Unified `WorkItem` model with pure status-mapping functions (`work-view.models.ts`, unit-tested in `work-view.models.spec.ts`).
  - List and Board presentations, per-record-type pagination with explicit "Load more" (no page presented as a complete result set).
  - Filters: search, record types, people, statuses (all via `HlmComboboxMultiple`), case, and a date preset (all/overdue/today/upcoming); team filters are hidden via `showTeamFilters=false` for My work.
  - Reuses the existing `TaskDialogService`/`DeadlineDialogService`/`EventDialogService`, `ConfirmDialogService`, and `ToastService` rather than duplicating dialogs or confirmation/toast UX.
  - Board drag-and-drop via Angular CDK (`@angular/cdk/drag-drop`), restricted to transitions the backend actually exposes (task set-in-progress/complete/reopen, deadline satisfy/reopen, event complete) — drags to Cancelled or event-reopen are rejected since no such endpoint exists.
  - `fixedUserId`/`fixedCaseId` inputs lock the "My work"/case context; resets and query-param sync never clear them.
- [x] Team work and My work screens (`team-work/`, `my-work/` thin wrappers) on new routes `/work/team` and `/work/my`; old `/tasks-deadlines` now redirects via `tasks-deadlines-redirect.component.ts` preserving query params; sidebar nav replaced the single "Tasks & Deadlines" entry with "Team work" and "My work"; the old `TasksDeadlinesComponent` was removed.
- [x] Calendar integration: added `list`/`board` to the existing Month/Week/Agenda view switch in `calendar.component.ts`, rendering `WorkView` in place of the grid without touching the existing month/week/agenda rendering or date math.
- [x] Case → Work tab: added a `work` tab in `case-detail.component.ts/html` rendering `WorkView` with `[fixedCaseId]="id"`, alongside the existing (untouched) activities/responsibilities tabs.
- [x] English and Serbian translations added for all new navigation, filter, status, board-column, and action strings.
- [x] Delivery track created and linked from `delivery/index.md`.

## Verification results

- `NX_TUI=false npx nx build api --skip-nx-cache` — passed, no errors.
- `NX_TUI=false npx nx build api-clients --skip-nx-cache` — passed, no errors.
- `NX_TUI=false npx nx build web --skip-nx-cache` — no TypeScript/Angular template errors. Build still reports pre-existing production bundle-budget failures (initial bundle and `assistant.component.scss`) that predate this track and were not introduced by it; they were not addressed here as they are out of scope for this feature.
- `NX_TUI=false npx nx test web -- apps/web/src/app/features/work-management/work-view/work-view.models.spec.ts` — 1 suite / 12 tests passed, covering status-mapping (Task/Deadline/Event → presentation status), pagination merge (`mergePage`, no duplicates/omissions), and allowed-drag-transition guards.
- i18n cross-check: every `| translate` key referenced by the changed calendar and case-detail templates was confirmed present in both `eng.json` and `ser.json`, except two pre-existing gaps (`cases.closedDate`, `cases.closingNote`) in the untouched case-close form, which predate this track and were left as-is (noted here for visibility, not fixed as part of this scope).

## Resolved gaps from the parent track

The predecessor track ([activities_tasks_deadlines_20260917](../activities_tasks_deadlines_20260917/plan.md)) explicitly flagged two backend limitations under "Remaining API work." Both are now resolved:

- "Task/deadline list services ... do not apply search or date filters in Prisma" — fixed; `search`/`from`/`to` are now applied.
- "Task/deadline status filters accept one enum value only" — fixed; `statuses` (repeated query key) now supports an `IN` filter alongside the original single-value field.

## Known limitations / follow-ups

- Board "Load more" is tracked per underlying record type, not per rendered column; a column fed by two record types (e.g. "To do" = Task + Deadline + Event) can still require more than one "Load more" click to reveal further items of a specific type.
- Calendar's List/Board reuses `WorkView` with `syncQueryParams=false` to avoid clobbering the calendar's own `view`/`date` query params; as a result, List/Board-specific filter state (record types, people, statuses) does not currently persist across a full page reload from Calendar the way it does on the dedicated Team/My work pages.
- No end-to-end/browser verification was performed (no running backend/browser session in this environment); verification here is limited to build success, unit tests, and static i18n-key cross-checks.
- Drag-and-drop is a secondary interaction; all transitions remain available as explicit, keyboard-accessible buttons.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
