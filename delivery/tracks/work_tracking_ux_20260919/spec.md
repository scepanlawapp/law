# Work-Tracking UX Specification

## Scope

The workspace already has separate, working surfaces for Tasks, Deadlines, and Calendar events (see [activities_tasks_deadlines_20260917](../activities_tasks_deadlines_20260917/index.md) and [calendar_workspace_ui_20260917](../calendar_workspace_ui_20260917/index.md)). This track unifies their List/Board presentation into one reusable component and reuses it in four places instead of building four separate screens:

1. **Team work** — all workspace-accessible work, with full filters.
2. **My work** — the current user's own work (assigned/responsible/organizer-or-assignee, per entity), without the team filter toolbar.
3. **Calendar** — List/Board added alongside the existing Month/Week/Agenda views.
4. **Case → Work tab** — work scoped to one case, with the case fixed and creation prefilled.

## Domain rules honored (no invented statuses)

- `EventStatus`: `SCHEDULED | COMPLETED | CANCELLED` — no in-progress state.
- `TaskStatus`: `TODO | IN_PROGRESS | DONE | CANCELLED`.
- `DeadlineStatus`: `OPEN | SATISFIED | CANCELLED` — no in-progress state.
- Board columns are a presentation-only mapping: **To do** (Task `TODO`, Event `SCHEDULED`, Deadline `OPEN`), **In progress** (Task `IN_PROGRESS` only), **Done** (Task `DONE`, Event `COMPLETED`, Deadline `SATISFIED`), **Cancelled** (all three, reachable only via the open/history switch).
- Every status change — via button or drag-and-drop — calls an existing, backend-supported transition endpoint. No new transitions were invented; drag targets with no supported transition are rejected (e.g., there is no event "reopen", so a completed/cancelled event card cannot be dragged back).
- Notes and ActivityLog remain history; they are never rendered as work items or board cards.

## "My work" semantics

Defined per entity by existing domain relationships, not by "created by":

- Task: `assigneeUserId` equals the current user.
- Deadline: `responsibleUserId` equals the current user.
- Event: current user is the organizer OR one of the assignees (existing `OR` semantics reused from the calendar aggregation query).

## Context locking

`fixedUserId` (My work) and `fixedCaseId` (Case → Work tab) are enforced by the shared component itself. Switching presentation (List/Board), changing optional filters, or using "reset filters" never removes these fixed constraints — only the _optional_ filter state is cleared.

## Data correctness requirements

- Server-side filtering only; no client-side "filter the current page and call it the result." Pagination uses explicit per-record-type "Load more," never presenting one loaded page as if it were the complete board/list.
- Multi-person and multi-status filters are true server-side `IN` filters, not client-side post-filtering of a single-value request.
- Search actually filters `title`/`description` server-side (previously accepted but silently ignored — see Remaining/Resolved Gaps below).

## Exclusions

- No new database tables or tenant/schema changes.
- No rebuild of case forms, client tabs, notes management, documents, or notifications.
- No drag-and-drop into a state without a backing transition endpoint.
