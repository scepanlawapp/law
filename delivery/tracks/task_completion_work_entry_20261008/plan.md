# Plan

- [x] Inspect completion and capture paths; create branch and track/index.
- [x] Add validated atomic task/work-entry persistence.
- [x] Integrate quick capture with board and task editor.
- [x] Test confirmation, dismissal, validation/failure and duplicate protection; build frontend.
- [x] Update business behavior documentation and mark track complete.

## Verification

- Web: 56 focused tests passed across quick capture, completion service, task editor, work view handlers and transition models.
- API: 86 focused tests passed across tasks/deadlines, work entries and source entries. Task tests were rerun after completion activity logging was adjusted.
- `nx build web --configuration=development`: passed (final build outside sandbox with two Angular workers).
- `tsc --noEmit -p apps/api/tsconfig.app.json`: passed.
- ESLint: no errors; existing `any` warnings remain in the domain service.
- Browser reached the local login page; authenticated keyboard, overlay, responsive and theme checks were not performed.

## Behavior notes

- The existing source uniqueness rule remains: reopening and completing a task reuses its entry. Existing settled entries are preserved; proposals are confirmed with the entered fields.
- Existing API/assistant callers without capture retain their proposed-entry flow. The frontend completion paths always require capture confirmation.
