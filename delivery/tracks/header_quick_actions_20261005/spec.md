# Header Quick Actions Specification

## Goal

Make the existing task and calendar-event creation flows available directly from the global header, beside the existing create-work action.

## Requirements

- Add a localized `Create task` header button that opens the existing task dialog in create mode.
- Add a localized `Create event` header button that opens the existing event dialog for the current local date and hour.
- Place both actions beside the existing create-work button and reuse the installed Spartan button and dialog patterns.
- Keep every button explicitly non-submitting and preserve the existing work-capture and notification behavior.

## Exclusions

- No backend, API-contract, database, or dialog-form changes.
- No new task or event creation workflow.
- No changes to work-management or calendar list behavior after a dialog closes.
