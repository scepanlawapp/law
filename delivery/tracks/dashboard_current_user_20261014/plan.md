# Plan

- [x] Create delivery track and register it.
- [x] Add server-side assignment, actor and document-creator filters.
- [x] Apply dashboard filters and personal scope labels.
- [x] Test filtering, sorting and existing personal calendar/notifications behavior.
- [x] Update implemented behavior documentation and complete track.

## Validation

- Dashboard Jest: 13 tests passed.
- Cases, documents, work and notification service Jest: 145 tests passed.
- Web development build passed (required running outside the sandbox after a sandboxed esbuild crash).
- API TypeScript check passed.
- Web lint reports existing errors in matter-link.component.ts, invoice-line-import-dialog.component.html and infinite-scroll.directive.ts, plus an existing client-detail warning; none are changed by this track.
- No live browser verification performed; layout and interactions are unchanged.
