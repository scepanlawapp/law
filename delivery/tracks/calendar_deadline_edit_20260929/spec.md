# Calendar Deadline Edit Specification

## Problem

`CalendarComponent.editEvent` opens the event dialog for event items but does not open an editor when the selected calendar item has `sourceType === "DEADLINE"`.

## Included

- Resolve a calendar deadline item to its full deadline detail by `sourceId`.
- Open the reusable deadline dialog with that deadline in edit mode.
- Refresh the visible calendar range after a successful edit.
- Cover the deadline edit interaction with a focused component test.

## Excluded

- Task editing from Calendar.
- Deadline dialog form or backend contract changes.
- Calendar interaction redesign beyond the existing edit trigger.
