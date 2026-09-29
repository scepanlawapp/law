# In-App Notifications Implementation Plan

- [x] Inspect Prisma, authentication/workspace context, settings semantics, task/deadline/event services, routing, header, API clients, UI primitives, scheduler infrastructure, and tests.
- [x] Create and register the delivery track and implementation branch.
- [x] Add Prisma notification enum/model, relations, preferences JSON, and migration.
- [x] Add shared typed contracts and validated default notification preferences.
- [x] Implement centralized notification creation/content builders, scoped list/read APIs, and unread count.
- [x] Integrate assignment/change/cancellation notifications into domain transactions.
- [x] Implement hourly task/deadline/event reminder processing with timezone handling and database deduplication.
- [x] Add frontend API/store integration and replace the mock header dropdown with loading/error/empty/read/show-more behavior.
- [x] Add per-type notification controls to existing workspace settings.
- [x] Add backend tests for isolation, pagination/read state, preferences, generation, reminder windows, deduplication, and rescheduling.
- [x] Update translations and implemented-business-logic documentation.
- [x] Run Prisma validation/generation, targeted tests, builds, lint/type checks, and record verification results.

## Verification

- Prisma schema validation, formatting, and client generation passed.
- The notification migration was applied successfully to the local database. Deployment then stopped on the later, unrelated `20260929091355_billing_statement_invoice` migration because an expected billing index is absent; that migration state was left untouched.
- Focused API tests passed: 5 suites and 20 tests covering notification behavior, domain integration, settings validation, and existing work-tracking behavior.
- API production build passed.
- Web TypeScript and Angular template compilation passed.
- Changed TypeScript files linted with no errors; existing activity-service patterns still report warnings.
- A full API-suite attempt reached 29 passing suites and 201 passing tests before environment-dependent Mastra tests timed out while PostgreSQL access was denied by the sandbox.
- The Nx web build completed all dependent libraries, then the esbuild process deadlocked without reporting a source or template error. Direct TypeScript and Angular template checks remain green.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
