# In-App Notifications Specification

## Scope

Add an in-app-only notification system for the existing single-database, hardcoded-workspace application. Every notification belongs to both the fixed workspace and one user. The feature covers task assignment and due-state notifications, deadline assignment/change/due-state notifications, event change/cancellation/upcoming notifications, read state, a header dropdown, and user preferences.

## Architecture decisions

- The live single-workspace model remains authoritative. HTTP notification access is resolved through `WorkspaceAccessGuard` and every read/write is scoped by `workspaceId` and authenticated `userId`.
- `UserSettings.workspaceNotifications` is the user master switch; `WorkspaceConfig.workspaceNotifications` is the workspace creation switch. Historical notifications are not deleted when either is disabled.
- Per-type preferences are stored as validated JSON on `UserSettings`. Missing rows, missing JSON, and missing keys default to enabled.
- Immediate notifications are written through the centralized notification service in the same transaction as task/deadline/event mutations.
- An hourly application service processes current reminder windows. It does not reuse assistant `WorkflowJob`. Deterministic schedule-aware keys plus a database unique constraint make concurrent/repeated runs idempotent.
- Persisted notification copy uses Serbian Latin, the application's canonical stored script. UI chrome is localized through existing English/Serbian translation files.
- Internal event recipients are the organizer and `EventAssignee` users, deduplicated. `EventAttendee` is never an in-app recipient.

## Reminder rules

- Tasks: one-day-before, due-today, and one overdue notification for `TODO`/`IN_PROGRESS` tasks.
- Deadlines: seven-, three-, and one-day-before, due-today, and one overdue notification for `OPEN` deadlines.
- Events: one-day-before for `SCHEDULED` events.
- `dueAt` takes priority over `dueDate`; the schema and DTOs already prevent both from being supplied together.
- Date-only comparisons use the user timezone, falling back to workspace configuration and then `Europe/Belgrade`. Deadline-specific and event-specific timezones take priority where present.
- Reminder keys include the target schedule so rescheduling permits a new reminder for the new occurrence.

## Exclusions

No email, SMS, push, third-party channels, WebSockets, digests, mentions, snooze, escalation, or custom intervals.
