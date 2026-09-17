# Calendar Workspace UI Specification

Implement the existing `/calendar` route as a real workspace calendar without adding a Calendar database entity or changing backend architecture.

## Included

- Real typed integration with the existing calendar read endpoint.
- URL-persisted date, view, search, source, and status state.
- Responsive Month and Agenda views in the first UI milestone, with Week planned in the same track.
- Spartan/UI toolbar, filters, empty/loading/error/incomplete states, and accessible item details interaction.
- Date-only values remain date-only; timed values render in the selected display timezone.

## Backend boundary

The current backend returns `nextCursor` but does not consume a cursor boundary. The UI must not claim complete counts or silently truncate range results. Until the contract supports continuation, it marks the loaded range incomplete when a continuation is returned and exposes that state honestly.

## Excluded

Backend changes, frontend Tasks & Deadlines page, recurrence, reminders, drag-and-drop, external synchronization, automatic legal deadline calculation, and tenant databases/routing/managers.
