# Implementation plan

- [x] Inspect the current finance settings route, editor, API-facing forms, version history, and Spartan patterns.
- [x] Create this delivery track and register it in `delivery/index.md`.
- [x] Render the existing revenue-sharing editor directly on the settings route instead of a large modal.
- [x] Reorganize the existing sections and clearly mark role defaults/fixed compensation as unavailable where unsupported.
- [x] Keep publish confirmation, agreement editing, special-rule editing, simulator, and version history consistent with established UI patterns.
- [x] Fix nested Prisma snapshot writes that passed `workspaceId` redundantly to agreement/rule child creates; cover both with a regression test.
- [x] Run focused frontend/API tests, lint/type/build checks as available, and review the diff for contract/schema scope.
- [x] Record implementation status, verification, and remaining backend dependencies in `report.md`.
