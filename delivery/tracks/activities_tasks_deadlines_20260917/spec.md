# Activities, Tasks, and Deadlines Specification

## Scope

Add five first-class workspace-scoped domain objects: `Event`, `Task`, `Deadline`, `Note`, and `ActivityLog`. The calendar is a projection over dated records and does not have a database entity.

## Domain rules

- Events represent meetings, hearings, calls, and other scheduled appointments. They support time zones, all-day events, optional case linkage, multiple office assignees, multiple clients, and external attendees. Hearing records may carry optional `courtName` and `courtroom` fields.
- Tasks represent work to complete. Version one has one responsible user, optional case/client links, either a date-only `dueDate` or exact `dueAt`, optional deadline linkage, and completion metadata.
- Deadlines remain separate from tasks. They are manually entered, may have several preparation tasks, and calculate overdue when open and past due. Completing a task never satisfies a deadline automatically.
- Notes represent user-authored information, including unscheduled call summaries. Notes may link to a case, client, or event.
- ActivityLog is automatically generated user-facing history. It is separate from technical `AuditEvent`, stores compact non-sensitive metadata, and supports case/client filtering.

## Relationship rules

- Case-specific work sets `caseId`.
- Client work without a case sets direct `clientId`.
- Internal work leaves both empty.
- A direct client plus case is allowed only when meaningful and must be validated as a case client.
- Events with several clients use `EventClient`.
- Existing `ClientActivity` and `CaseActivity` remain during this database foundation step and are planned for later migration into Notes plus ActivityLog records.

## Exclusions

Automatic legal deadline calculation, recurring events, reminders/notifications, task collaborators, a persisted Calendar entity, and API endpoints in the database-only checkpoint.
