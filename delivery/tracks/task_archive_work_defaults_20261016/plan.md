# Implementation Plan

- [x] Create track specification, plan, metadata, index, and register delivery link.
- [x] Add ARCHIVED persistence and shared contract support, including migration and focused backend checks.
- [x] Implement task edit/archive UI, three-column board, and initial task filters.
- [x] Replace work-review duration with right-aligned value and currency.
- [x] Set default API sorting for clients, cases, and users with regression checks.
- [x] Use content-width currency dropdowns throughout the application.
- [x] Set Team Time default statuses and validate focused frontend behavior.
- [x] Update implemented behavior documentation and complete track after validation.

## Verification

- Focused API Jest: 4 suites, 67 tests passed (task archiving without work creation, default and explicit ordering).
- Focused web Jest: 8 suites, 68 tests passed (board/archive, task editing, Team Time defaults, review value, payment/currency behavior).
- API TypeScript and Angular compilation passed; Prisma schema validation and client generation passed.
- Task enum migration applied and registered locally; unrelated pending MFA migration was not applied.
- Demo seed syntax checked without executing/reseeding.
- Live browser confirmed three board columns, Archive controls, task query statuses TODO/IN_PROGRESS/DONE, Team Time query statuses PROPOSED/RUNNING/CONFIRMED, and right-aligned review value/currency. No horizontal page overflow on these desktop pages. Existing tasks were not archived during browser verification.
- Frontend lint passed. Backend normal lint is blocked by the existing Nx module-boundary rule classifying core as lazy-loaded due to assistant-actions.service.spec.ts; with only that rule disabled, remaining lint passed with existing no-explicit-any warnings. Whitespace checks passed.
- Workspace user references are not paginated; their existing endpoint now sorts by first name, last name, then email without a contract change.
