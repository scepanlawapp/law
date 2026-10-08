# Plan

- [x] Inspect existing capture and completion; create branch and track.
- [x] Add task relation, migration/backfill, DTOs/filter and seed support.
- [x] Support multiple captures and validated completion without new work.
- [x] Add card action, task detail section and capture completion action.
- [x] Verify tests, schema, types and build; update business docs.

## Verification

- 52 focused frontend tests passed: task work section (rendering, pagination, refresh, errors, cancel), quick capture, task completion service, task editor and work-view handlers.
- 92 focused API tests passed: multiple task entries, workspace/role filtering, completion without new work, invalid/conflicting choices, and automatic source behavior. Task service tests rerun after adding the completion row lock.
- Frontend development build, API TypeScript check and Prisma generation passed.
- Task relation migration applied locally, including backfill of existing task-source entries. Four earlier additive migrations already present on main were reviewed and applied first in migration order.
- ESLint passed with existing domain-service `any` warnings; no new lint errors.
- Authenticated browser visual/keyboard checks were not performed.

## Behavior notes

- Work lists and the UI's existing-work check respect existing work-entry read permissions.
- New explicit task captures use `taskId`; automatic source proposals retain their original unique source identity. Previous work is never overwritten when adding another entry.
