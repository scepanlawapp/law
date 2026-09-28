# Calendar Deadlines Visible Specification

## Problem

The Calendar component requests only `EVENT` records even though the calendar API and UI support `DEADLINE` items. Consequently, deadlines never reach any calendar view.

## Included

- Request the calendar's supported event, task, and deadline sources for the visible range.
- Preserve the existing source filter, lawyer filter, open/closed filter, and date-only deadline rendering.
- Rename the existing event creation action to “Create obligation.”
- Add a separate “Create deadline” action that opens the reusable deadline dialog with the selected calendar date prefilled.
- Refresh the visible calendar range after a deadline is saved.
- Present week-view dates as non-interactive headers rather than buttons.
- Keep the week-view header row visible while the all-day and hourly rows scroll.
- Show tasks and deadlines in a sticky obligations row under each week-view date, using their due date or due timestamp as the completion target.
- Render each obligation on one truncated line with a red marker; clicking it opens the existing details popover.
- Keep timed events in the hourly grid without duplicating tasks or deadlines there.
- Default newly created tasks to no due target; editing preserves the saved due date or timestamp.
- Add focused regression coverage for the calendar range query.

## Excluded

- Recurrence, reminders, pagination changes, task/deadline editing from Calendar, or backend contract changes.
