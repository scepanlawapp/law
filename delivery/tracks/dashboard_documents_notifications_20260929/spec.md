# Dashboard Documents and Notifications Specification

## Problem

The dashboard still marks total documents as unavailable and only tells users to open the header for notifications, even though document and notification APIs are implemented.

## Included

- Load the workspace-wide document count from document pagination metadata.
- Show the document count in the existing dashboard summary card and link it to Documents.
- Reuse the application notification store in the dashboard.
- Show recent notifications with loading, error, empty, unread, context, and relative-time states.
- Mark a notification read and navigate to its task, deadline, or event context when selected.
- Keep the notification dashboard panel synchronized with the header notification menu.
- Add focused tests and update implemented-business documentation.

## Excluded

- Changing notification generation or reminder schedules.
- Adding a dedicated notifications route.
- Changing document upload or document lifecycle behavior.
