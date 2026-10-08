# Plan

- [x] Inspect dialog, work-entry permissions and deletion; create branch and track.
- [x] Add action eligibility and transactional last-entry deletion guard.
- [x] Make task work list clickable and implement modal confirmation/info states.
- [x] Test permissions, last-entry guard, cancel/delete/error and refresh; build and type-check.
- [x] Update business docs and complete track.

## Verification

- 54 focused frontend tests passed (quick-capture modal, task entry list and task capture service).
- 62 work-entry API tests passed, including permission eligibility, last-entry rejection, lock-before-count ordering and preservation of the remaining entry.
- Frontend development build and API TypeScript check passed.
- ESLint and diff whitespace checks passed.
- No database migration is needed. Authenticated browser visual/focus checks were not performed.

## Behavior notes

- Delete controls are enabled when opening an existing entry from task details; other quick-capture entry points retain their existing behavior.
- The API protects the last task-linked entry through every deletion endpoint caller, not just the task modal.
- Deletion returns no saved entry; a per-opening callback invalidates the task work list after successful removal.
