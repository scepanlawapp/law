# Task Archive and Work Defaults

## Requirements

- Tasks support ARCHIVED in persistence, shared contracts, editing, and status filtering.
- Work board task cards offer an Archive action beside Add work, without confirmation.
- Work board has Todo, In Progress, and Done columns only; initial task requests explicitly select these statuses.
- Work review replaces duration with right-aligned value and currency, matching Team Time.
- Paginated clients default to name, cases to case number, and users to name; explicit sorting remains supported.
- Currency select dropdowns throughout the app size to content rather than trigger width.
- Team Time initially requests only PROPOSED, RUNNING, and CONFIRMED entries.

## Constraints

Preserve workspace scoping, activity logging, existing filters, role permissions, and unrelated user edits. Archiving changes task status only and does not create work or prompt for confirmation.
