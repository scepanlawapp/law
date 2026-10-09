# Revenue Sharing Settings — implementation report

Implemented on branch `revenue_sharing_settings_20261009`.

- `/finance/settings` has six sections with typed forms, semantic theme tokens, existing Spartan components, loading/error/saving states, draft edits, publication confirmation, navigation/unload protection and real API persistence.
- Revenue sharing is disabled by default. Modes share one configuration model and preserve inactive data. Work rates support four client origins, explicit zero/exclusion, missing values and per-field inheritance. Origination bonuses are separate and avoid self-origination double counting by default.
- Member agreements reuse User/WorkspaceMember identities, include effective periods, opt-out and departure policies, and retain former and returning members. Rate terms remain immutable; closing periods and departure amendments are new audit snapshots. Amendments require a reason. Saved previews resolve rates at the entitlement date and later departure terms at collection.
- Special rules support firm/member/client/case/calendar-event scopes, categories, override/additive/exclusive-pool policies and effective periods. Backend validation enforces exact percentage precision, ownership, date ranges, agreement overlaps, same-level conflicts and exclusive pool totals. Existing inactive rules can preserve deleted scope references; new references still require ownership checks.
- Immutable version/audit snapshots and indexed projections are protected by serializable transactions, optimistic version checks, foreign keys, period/percentage constraints and append-only SQL triggers. Percentages use exact decimal strings in JSON and Decimal(5,2) special-rule projections.
- The hypothetical simulator operates on edited settings, resolves precedence and inheritance, explains applied policies and warns about gaps/missing/conflicting configuration. It writes no earnings or financial records. Its input is an already prepared eligible amount under the chosen VAT/expense policy.

## API

All routes require the existing CSRF/origin, session and active-workspace guards plus OWNER/ADMIN authorization, with additional service checks. Workspace identity comes exclusively from WorkspaceContextService.

| Method | Endpoint                          | Purpose                                                                                                                                                             |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/revenue-sharing`            | Latest editable published configuration; disabled defaults before first publication                                                                                 |
| PUT    | `/api/revenue-sharing`            | Publish all settings/enablement, agreement versions/closures and rule changes/deactivations atomically; requires expectedVersion, effectiveFrom and optional reason |
| GET    | `/api/revenue-sharing/references` | Read-only existing members (including former identities), clients, cases and calendar events                                                                        |
| GET    | `/api/revenue-sharing/history`    | Immutable revisions, authors, reasons and effective dates; UI renders old/new values                                                                                |
| POST   | `/api/revenue-sharing/preview`    | Hypothetical scenario against supplied edited configuration or date-resolved persisted settings                                                                     |

## Database and localization

Migration: `apps/api/prisma/migrations/20261009130000_revenue_sharing_configuration/migration.sql`.

New models: RevenueSharingSettings, RevenueSharingVersion, RevenueSharingAgreement and RevenueSharingRule. Existing User and Workspace models gain inverse relations only. No active percentages are seeded.

Localization: `apps/web/public/i18n/ser.json` and `apps/web/public/i18n/eng.json`. Serbian remains the application's default. Displayed enum values, accessibility labels, empty states, confirmations and stable errors are translated. Dates, percentages and preview currency use the active locale.

## Verification

- Final targeted API unit and HTTP integration run: **38 tests passed** across two suites. HTTP integration uses real Nest controllers/role guards/context/validation with a Prisma storage test double.
- Earlier API regression run: **160 tests passed** across six suites, including authentication, organization settings, work entries and financials as well as the feature's then-current tests.
- Final web feature/sidebar/billing-guard run: **19 tests passed** across three suites (13 feature/localization tests plus six existing regression tests). Tests include the actual switch control, publication, error retention, draft agreements, preview, browser unload and translations.
- Prisma schema validation and client generation: passed.
- Angular compiler/type/template check (`ngc --noEmit`): passed.
- ESLint for all new TypeScript and affected route/module/sidebar files: passed without warnings.
- API Nx build: passed. Development web Nx build: passed.
- Production web build: compilation succeeds but the initial application bundle exceeds the unchanged 1.75 MB budget (2.31 MB). An isolated untouched HEAD build also fails the same budget (2.32 MB). Budget settings and unrelated screens were not changed.
- Explicit schema comparison confirmed Event, EventAssignee, WorkEntry, Invoice, InvoiceLine and WorkspaceMember models are unchanged. `git diff --check` passes.

## Rollout limits and deferred integration

The migration is **added but not applied**. PostgreSQL at localhost:5432 is unavailable. `npm run services:up` fails because Docker Desktop WSL integration is unavailable in this distro. Enable that integration/start the established services, run the normal `npm run db:migrate`, then verify save/refresh/restart against live PostgreSQL. Live database and full-browser visual/responsive/keyboard smoke checks were not performed; Jest tests do not substitute for them.

Work Event selection currently uses existing calendar Event identities. Work-entry/invoice/payment integration, production earnings, allocation/backfill, reports, payouts and salary processing remain deferred. No calculation is automatically triggered by enabling these settings.

**Work Events, invoicing, payments and financial calculations were not modified.** Existing profile/company settings were not changed. The pre-existing package-lock.json edit was left untouched.

## Created files

- `apps/api/prisma/migrations/20261009130000_revenue_sharing_configuration/migration.sql`
- `apps/api/src/app/revenue-sharing.http.spec.ts`
- `apps/api/src/app/revenue-sharing.spec.ts`
- `apps/web/src/app/features/revenue-sharing/revenue-rate.component.ts`
- `apps/web/src/app/features/revenue-sharing/revenue-select.component.ts`
- `apps/web/src/app/features/revenue-sharing/revenue-sharing.component.html`
- `apps/web/src/app/features/revenue-sharing/revenue-sharing.component.spec.ts`
- `apps/web/src/app/features/revenue-sharing/revenue-sharing.component.ts`
- `apps/web/src/app/features/revenue-sharing/revenue-sharing.guard.ts`
- `delivery/tracks/revenue_sharing_settings_20261009/index.md`
- `delivery/tracks/revenue_sharing_settings_20261009/metadata.json`
- `delivery/tracks/revenue_sharing_settings_20261009/plan.md`
- `delivery/tracks/revenue_sharing_settings_20261009/report.md`
- `delivery/tracks/revenue_sharing_settings_20261009/spec.md`
- `libs/api/api-interfaces/src/lib/revenue-sharing.ts`
- `libs/api/features/revenue-sharing/src/index.ts`
- `libs/api/features/revenue-sharing/src/lib/revenue-sharing.controller.ts`
- `libs/api/features/revenue-sharing/src/lib/revenue-sharing.module.ts`
- `libs/api/features/revenue-sharing/src/lib/revenue-sharing.preview.ts`
- `libs/api/features/revenue-sharing/src/lib/revenue-sharing.service.ts`
- `libs/api/features/revenue-sharing/src/lib/revenue-sharing.validation.ts`
- `libs/shared/frontend/api-clients/src/lib/revenue-sharing.api-client.ts`

## Changed files

- `.github/bussiness-logic-done-so-far.md`
- `apps/api/prisma/schema.prisma`
- `apps/api/prisma/seed-demo-data.cjs`
- `apps/api/src/app/app.module.ts`
- `apps/web/public/i18n/eng.json`
- `apps/web/public/i18n/ser.json`
- `apps/web/src/app/app.routes.ts`
- `apps/web/src/app/layout/sidebar/sidebar.component.ts`
- `delivery/index.md`
- `libs/api/api-interfaces/src/lib/api-interfaces.ts`
- `libs/shared/frontend/api-clients/src/index.ts`
- `tsconfig.base.json`
