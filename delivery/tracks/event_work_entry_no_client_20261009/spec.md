# Event Work Entry Without Client

## Goal

Allow users to record or write off work for a calendar event even when it has no client association.

## Requirements

- An event-linked work entry may have no client only when it is non-billable.
- Event-linked work may retain a client when the event's case or unique client supplies one.
- Manual, task-linked, and all other work entries continue to require a client.
- Clientless entries remain visible and editable in time views; editing cannot make them billable without assigning a client.
- Client-specific billing, retainer, and profitability calculations must not include clientless entries.

## Acceptance

- Writing off a past event with no client creates confirmed non-billable work linked to that event.
- Clientless event work can be edited without inventing a client.
- Requests that create or make non-event work clientless, or make clientless event work billable, are rejected.
- Existing event/client behavior remains unchanged.
