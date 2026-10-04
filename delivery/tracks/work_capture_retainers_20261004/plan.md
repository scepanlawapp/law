# Work Capture, Retainers, and Month-End Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace task/event/deadline billing sources with a `WorkEntry` ledger, add fast work capture (quick form, AI free text, timer, completion prompts, end-of-day review), retainer agreements, an owner-run month-end billing run, and a profitability report.

**Architecture:** A new Nest feature lib `@law/work-entries` (`libs/api/features/work-entries`) owns entries, categories, retainers, client billing profiles, user rates, retainer allocation (pure functions), the month-end run, usage and profitability. `@law/activities-tasks-deadlines`, `@law/cases`, and `@law/clients` call it to create entries from completed work and logged activities. `@law/financials` bills entries instead of tasks/events/deadlines. The Angular app gets one quick-capture dialog reused by every capture path, plus time, month-end, and profitability screens.

**Tech Stack:** NestJS, Prisma/PostgreSQL, Jest (backend specs in `apps/api/src/app/*.spec.ts`), Angular 22 signals + typed reactive forms, Spartan/UI Helm, `@law/mastra` `MastraChatModelProvider` for the AI parse.

**Spec:** [spec.md](spec.md)

## Global Constraints

- Every query is scoped by `WorkspaceContextService.required.workspaceId`. Endpoints use `CsrfOriginGuard` + `AuthGuard` + `WorkspaceAccessGuard` like `FinancialsController`.
- Shared FE/BE types go in a new `libs/api/api-interfaces/src/lib/work-entries.ts`, re-exported from `libs/api/api-interfaces/src/index.ts`.
- Stored text is Serbian Latin: run descriptions through `@law/transliteration` before saving.
- `minutes` is an integer from 1 to 1440. It is required for `CONFIRMED`. It may be null for `RUNNING`, `PROPOSED`, and legacy `BILLED`.
- At most one `RUNNING` entry per user. One entry per `(workspaceId, sourceType, sourceId)`.
- `BILLED` entries are immutable (409). Unbilling returns them to `CONFIRMED`, or to `PROPOSED` when `minutes` is null.
- Roles:
  - OWNER/ADMIN manage everything except the month-end run, which is OWNER only.
  - LAWYER can read entries on cases where they have an active `CaseResponsibility`.
  - MEMBER sees only their own entries.
  - Rates and profitability are OWNER/ADMIN only.
- AI is optional: the parse endpoint never writes, and every form works without it.
- Mutations of entries write `ActivityLog` rows:
  - actions: `WORK_ENTRY_CREATED`, `WORK_ENTRY_UPDATED`, `WORK_ENTRY_CONFIRMED`, `WORK_ENTRY_WRITTEN_OFF`, `WORK_ENTRY_BILLED`, `WORK_ENTRY_UNBILLED`
  - `entityType`: `"WORK_ENTRY"`
  - `metadata.source = "AI_ASSISTED"` when `aiParsed`
- UI:
  - standalone components, `inject()`, signals, `@if`/`@for`
  - Spartan Helm primitives and semantic color tokens only
  - selects use `{ value, label }` + `createSelectItemToString`
  - `HlmSpinner` while waiting on HTTP
  - every new string gets both `sr` and `en` translations
- Money is `Decimal(18,2)`, computed with `Prisma.Decimal` on the server. Amounts are rounded half-up to 2 decimals.
- Run backend tests with `npx nx test api --testFile=<name>`. Run web tests with `npx nx test web --testFile=<name>`.

## Review Focus

1. **Client with a retainer in EUR and an hourly profile in RSD:** the run must produce one draft per currency, never a mixed-currency statement. Test in Task 10.
2. **An entry that crosses the retainer cap:** it is linked to the overage line, and only its over-cap minutes are priced. A re-run in the same month counts minutes already billed under the fee line toward the cap. Test in Task 3.
3. **Retainer that starts on the 15th:** fee and cap are prorated by active days. A month with no active retainer days produces no fee line. Test in Task 3.
4. **A completed task with no client** (no `clientId`, no case) or an event with two clients: no entry is created, and no transition fails because of it. Test in Task 5.
5. **Revenue in EUR while rates and target are in RSD:** profitability shows the hours and the time value, plus "nije uporedivo", never a mixed-currency effective rate. Test in Task 11.

---

## File map

**Backend: new lib `libs/api/features/work-entries/src/`**

| File | Responsibility |
| --- | --- |
| `index.ts` | barrel |
| `lib/work-entries.module.ts` | Nest module; exports `WorkEntriesService`, `WorkEntrySourcesService` |
| `lib/work-entries.dto.ts` | class-validator DTOs |
| `lib/work-entries.controller.ts` | `/work-entries/*` |
| `lib/work-entries.service.ts` | CRUD, timer, confirm, write-off, review, permissions |
| `lib/work-entry-sources.service.ts` | `ensureForSource()` used inside other modules' transactions |
| `lib/treatment.ts` | pure: default treatment |
| `lib/retainer-allocation.ts` | pure: proration, cap, overage, out-of-scope grouping |
| `lib/billing-setup.service.ts` + `billing-setup.controller.ts` | categories, retainers, client billing profiles, user rates, workspace billing config |
| `lib/work-capture-parser.ts` | AI parse (provider + schema + prompt) |
| `lib/month-end-run.service.ts` | pre-check + generate drafts |
| `lib/retainer-usage.service.ts` | usage per client/month + 80/100% alerts |
| `lib/profitability.service.ts` | report |
| `lib/billing-reports.controller.ts` | `/billing/*` (usage, month-end, profitability) |

**Backend modified:**
- `apps/api/prisma/schema.prisma` and a new migration
- `apps/api/prisma/seed-demo-data.cjs`
- `apps/api/src/app/app.module.ts`
- `tsconfig.base.json` (alias `@law/work-entries`)
- `libs/api/features/activities-tasks-deadlines/.../activities-tasks-deadlines.service.ts` and its `.module.ts`
- `libs/api/features/cases/src/lib/cases.service.ts`, `cases.dto.ts`, `cases.module.ts`
- `libs/api/features/clients/src/lib/clients.service.ts`, its DTO, and its module
- `libs/api/features/financials/src/lib/financials.{service,dto,controller,module}.ts`
- `libs/api/features/notifications/src/lib/{notifications.service,notification-content,notification-reminder.service}.ts`
- `libs/api/api-interfaces/src/lib/api-interfaces.ts`: remove `BillableWork*`, update `BillingStatementLineInput`, `NotificationType`, `NotificationPreferences`

**Frontend new:**
- `apps/web/src/app/features/time/`:
  - `quick-capture/quick-capture-dialog.{component.ts,component.html,service.ts}`
  - `timer/work-timer.store.ts`, `timer/header-timer.component.ts`
  - `completion-prompt/completion-prompt.service.ts`
  - `my-time.component.*`, `team-time.component.*`, `time-review.component.*`
- `apps/web/src/app/features/finance-month-end/month-end.component.*`
- `apps/web/src/app/features/finance-retainers/retainers.component.*`
- `apps/web/src/app/features/reports/profitability/profitability.component.*`
- `apps/web/src/app/features/settings/billing-settings.component.*`
- `apps/web/src/app/features/clients/client-retainer-card/client-retainer-card.component.*`

**Frontend modified:**
- `libs/shared/frontend/api-clients/src/lib/api-clients.ts`: add `WorkEntriesApiClient`, `BillingSetupApiClient`, and `BillingReportsApiClient`; update `FinancialsApiClient`
- `app.routes.ts`, the sidebar, and the header
- `work-view.component.ts`, calendar event actions, `case-detail.component.ts`, `client-detail.component.ts`
- `finance-work-review/*`, `finance-statements/*` (import dialog, form, print view)
- `reports.component.*`, `workspace-settings`/settings nav
- `core/localization` dictionaries

---

### Task 1: Schema, migration, and backfill

**Files:**
- Modify: `apps/api/prisma/schema.prisma`
- Create: `apps/api/prisma/migrations/20261004120000_work_entries/migration.sql` (generated, then hand-edited)

**Interfaces:**
- Produces these Prisma models and enums:
  - `WorkEntry`, `ServiceCategory`, `RetainerAgreement`, `RetainerAgreementCategory`, `ClientBillingProfile`, `UserRate`
  - enums `WorkEntryStatus { RUNNING PROPOSED CONFIRMED BILLED WRITTEN_OFF }`, `WorkEntryTreatment { RETAINER AT HOURLY NON_BILLABLE UNDECIDED }`, `WorkEntrySource { MANUAL TIMER QUICK_CAPTURE TASK EVENT DEADLINE ACTIVITY EMAIL }`, `RetainerRule { HOURLY AT ABSORBED }`
- Produces these changes to existing models:
  - `WorkspaceConfig`: add `targetHourlyRate Decimal(18,2)?`, `internalCurrency String @default("RSD")`, `defaultVatRate Decimal(5,2) @default(20)`, `paymentTermDays Int @default(15)`
  - `UserSettings`: add `timeReviewReminderEnabled Boolean @default(false)`, `timeReviewReminderTime String @default("17:30")`
  - `BillingStatement`: add `printWorkSpecification Boolean @default(true)` and `billingMonth String?` (`"YYYY-MM"`, set by the month-end run)
  - `BillingStatementLine`: add `pricingRequired Boolean @default(false)`, `minutes Int?`, and relation `workEntries WorkEntry[]`
  - `Task`, `Event`, `Deadline`: remove `statementId` and the relation, along with `BillingStatement.events/tasks/deadlines`
  - `NotificationType`: add `TIMER_RUNNING_LONG`, `TIME_REVIEW_REMINDER`, `RETAINER_USAGE_80`, `RETAINER_USAGE_100`
- `WorkEntry` columns: as in spec §2, plus:
  - `statementLineId String?` → `BillingStatementLine` (`onDelete: SetNull`)
  - `sourceType String?` (`"TASK" | "EVENT" | "DEADLINE" | "CLIENT_ACTIVITY" | "CASE_ACTIVITY"`)
  - indexes `@@unique([workspaceId, sourceType, sourceId])`, `@@index([workspaceId, clientId, workDate])`, `@@index([workspaceId, userId, workDate])`, `@@index([workspaceId, status])`
- `RetainerAgreement`: as in spec §2. `includedMinutes Int?`, both hourly rates `Decimal(18,2)?`, `active Boolean @default(true)`.
- `ClientBillingProfile`: `clientId` is unique.
- `UserRate`: `@@unique([workspaceId, userId, effectiveFrom])`.

- [x] **Step 1: Edit the schema** with the models above. Run `npx prisma format --schema apps/api/prisma/schema.prisma`. Expected: no errors.
- [x] **Step 2: Generate the migration without applying it.** Run `npx prisma migrate dev --create-only --name work_entries --schema apps/api/prisma/schema.prisma`. Expected: a new folder containing `CREATE TABLE "WorkEntry"` and `DROP COLUMN "statementId"`.
- [x] **Step 3: Hand-edit `migration.sql`.**
  - **Partial unique index:** add one for running timers: `CREATE UNIQUE INDEX "WorkEntry_one_running_per_user" ON "WorkEntry"("workspaceId","userId") WHERE "status" = 'RUNNING';`
  - **Backfill, inserted after table creation and before the `DROP COLUMN` statements.** For each source type, insert `WorkEntry` rows, gen_random_uuid ids, `source` = type, `sourceType` = type, `description` = title, `createdByUserId` = `updatedByUserId` = the performer:
    - Tasks: `status='DONE'` with exactly one client from `{task.clientId, case.clientId}`. Performer `assigneeUserId`. `workDate = completedAt::date` (fallback `updatedAt`).
    - Deadlines: `status='SATISFIED'`, same client rule. Performer `responsibleUserId`. `workDate = satisfiedAt::date`.
    - Events: `status='COMPLETED'`. The client set is `EventClient.clientId ∪ case.clientId` and must have exactly one member (`GROUP BY e.id HAVING COUNT(DISTINCT c) = 1`). Performer `organizerUserId`. `workDate = startsAt::date`. `minutes = ROUND(EXTRACT(EPOCH FROM endsAt-startsAt)/60)` when `NOT isAllDay` and the value is between 1 and 1440, else NULL.
    - Rows whose source `statementId IS NULL` get `status = 'PROPOSED'`, `treatment = 'UNDECIDED'`.
    - Rows with `statementId` set get `status='BILLED'` and `statementLineId` = the `BillingStatementLine.id` where `sourceType`/`sourceId` match.
  - **Seed categories:** insert the seven `ServiceCategory` rows from spec §2 for the hardcoded workspace id, with `order` 0..6.
- [x] **Step 4: Apply the migration.** Run `npm run services:up && npm run db:migrate`. Expected: "All migrations have been successfully applied". Then run `npx nx run api:build`. Expected: TypeScript errors only in financials and activities code (fixed in Tasks 5 and 9). Record that list in the commit message body.
- [x] **Step 5: Verify the backfill on demo data.** Run `npm run db:seed:demo` on a fresh DB *before* this branch's migration: `git stash`, reset the DB, seed, `git stash pop`, migrate. Then:

  ```sql
  SELECT status, source, count(*) FROM "WorkEntry" GROUP BY 1,2;
  ```

  Expected: PROPOSED rows for each source type, no rows with a NULL `clientId`, and BILLED rows equal to the old count of non-null `statementId`.
- [x] **Step 6: Commit** `feat(work-entries): schema, migration and billing-source backfill`.

### Task 2: Shared contracts and lib scaffold

**Files:**
- Create: `libs/api/api-interfaces/src/lib/work-entries.ts`; modify `libs/api/api-interfaces/src/index.ts`
- Create: `libs/api/features/work-entries/src/index.ts`, `lib/work-entries.module.ts`; modify `tsconfig.base.json`, `apps/api/src/app/app.module.ts`
- Modify: `libs/api/api-interfaces/src/lib/api-interfaces.ts`

**Interfaces:** produces these exported types, used by every later task:

```ts
export type WorkEntryStatus = "RUNNING" | "PROPOSED" | "CONFIRMED" | "BILLED" | "WRITTEN_OFF";
export type WorkEntryTreatment = "RETAINER" | "AT" | "HOURLY" | "NON_BILLABLE" | "UNDECIDED";
export type WorkEntrySource = "MANUAL" | "TIMER" | "QUICK_CAPTURE" | "TASK" | "EVENT" | "DEADLINE" | "ACTIVITY" | "EMAIL";
export type WorkEntrySourceType = "TASK" | "EVENT" | "DEADLINE" | "CLIENT_ACTIVITY" | "CASE_ACTIVITY";
export type RetainerRule = "HOURLY" | "AT" | "ABSORBED";
export interface WorkEntry { id: string; user: UserReference; client: ClientReference; case: CaseReference | null; workDate: string; minutes: number | null; timerStartedAt: string | null; description: string; serviceCategory: { id: string; name: string } | null; treatment: WorkEntryTreatment; status: WorkEntryStatus; writeOffReason: string | null; source: WorkEntrySource; sourceType: WorkEntrySourceType | null; sourceId: string | null; statementId: string | null; aiParsed: boolean; createdAt: string; updatedAt: string; }
export interface CreateWorkEntryRequest { clientId: string; caseId?: string; workDate: string; minutes: number; description: string; serviceCategoryId?: string; treatment?: WorkEntryTreatment; source?: "MANUAL" | "QUICK_CAPTURE"; aiParsed?: boolean; }
export type UpdateWorkEntryRequest = Partial<CreateWorkEntryRequest>;
export interface WorkEntryQuery { userIds?: string[]; clientIds?: string[]; caseId?: string; statuses?: WorkEntryStatus[]; treatments?: WorkEntryTreatment[]; from?: string; to?: string; unbilledOnly?: boolean; page: number; pageSize: number; }
export interface StartTimerRequest { clientId: string; caseId?: string; description?: string; }
export interface ConfirmSourceEntryRequest { sourceType: WorkEntrySourceType; sourceId: string; minutes: number | null; description?: string; }
export interface WorkCaptureParseRequest { text: string; }
export interface WorkCaptureParseResponse { ok: boolean; clientId: string | null; clientCandidates: ClientReference[]; caseId: string | null; caseCandidates: CaseReference[]; minutes: number | null; serviceCategoryId: string | null; description: string | null; }
export interface TimeReviewResponse { entries: WorkEntry[]; proposed: WorkEntry[]; missingEvents: { eventId: string; title: string; startsAt: string; endsAt: string; client: ClientReference | null; case: CaseReference | null }[]; untouchedClients: { client: ClientReference; reasons: ("ACTIVITY" | "DOCUMENT" | "CHAT")[] }[]; }
export interface ServiceCategory { id: string; name: string; active: boolean; order: number; }
export interface RetainerAgreement { id: string; clientId: string; title: string; monthlyFee: string; currency: string; validFrom: string; validTo: string | null; includedMinutes: number | null; coveredCategoryIds: string[]; overageRule: RetainerRule; overageHourlyRate: string | null; outOfScopeRule: RetainerRule; outOfScopeHourlyRate: string | null; active: boolean; }
export type UpsertRetainerAgreementRequest = Omit<RetainerAgreement, "id" | "active">;
export interface ClientBillingProfile { clientId: string; hourlyRate: string | null; currency: string; }
export interface UserRate { id: string; userId: string; hourlyValue: string; currency: string; effectiveFrom: string; }
export interface WorkspaceBillingConfig { targetHourlyRate: string | null; internalCurrency: string; defaultVatRate: string; paymentTermDays: number; }
export interface RetainerUsage { client: ClientReference; agreementId: string; month: string; currency: string; fee: string; includedMinutes: number | null; coveredMinutes: number; outOfScopeMinutes: number; effectiveHourlyRate: string | null; targetHourlyRate: string | null; }
export interface MonthEndPrecheck { month: string; clients: { client: ClientReference; open: WorkEntry[] }[]; }
export interface MonthEndRunResult { month: string; statements: { statementId: string; client: ClientReference; currency: string; created: boolean; addedLines: number; pricingRequiredLines: number }[]; }
export interface ProfitabilityRow { client: ClientReference; minutes: number; revenue: { currency: string; net: string }[]; timeValue: string | null; unknownValueMinutes: number; effectiveHourlyRate: string | null; comparable: boolean; writtenOffValue: string | null; unbilledValue: string | null; }
export interface ProfitabilityReport { from: string; to: string; internalCurrency: string; targetHourlyRate: string | null; rows: ProfitabilityRow[]; byPerson: { user: UserReference; loggedMinutes: number; billedMinutes: number }[]; }
```

In `api-interfaces.ts`:
- Delete `BillableWorkSourceType` and `BillableWorkItem`.
- `BillingStatementLineInput`: drop `sourceType`/`sourceId`; add `workEntryIds?: string[]` and `pricingRequired?: boolean`.
- Add `pricingRequired`, `minutes`, and `workEntries: { id: string; workDate: string; user: UserReference; description: string; minutes: number | null }[]` to the line summary type, and `printWorkSpecification` + `billingMonth` to `BillingStatement`.
- Add the four notification types plus the preference keys `timerRunningLong`, `timeReviewReminder`, and `retainerUsage`.

- [x] **Step 1: Write the types above.** Add alias `"@law/work-entries": ["./libs/api/features/work-entries/src/index.ts"]`. Create an empty `WorkEntriesModule` and import it in `AppModule` after `FinancialsModule`.
- [x] **Step 2:** Run `npx nx run api-interfaces:test`. Expected: PASS. A failure in `api-interfaces.spec.ts` that references the removed `BillableWork*` types is fixed by deleting those assertions.
- [x] **Step 3: Commit** `feat(work-entries): shared contracts and module scaffold`.

### Task 3: Pure treatment and retainer allocation

**Files:**
- Create: `libs/api/features/work-entries/src/lib/treatment.ts`, `lib/retainer-allocation.ts`
- Test: `apps/api/src/app/retainer-allocation.spec.ts`

**Interfaces:** produces:

```ts
// treatment.ts
export interface AgreementTerms { id: string; validFrom: Date; validTo: Date | null; monthlyFee: Prisma.Decimal; currency: string; includedMinutes: number | null; coveredCategoryIds: string[]; overageRule: RetainerRule; overageHourlyRate: Prisma.Decimal | null; outOfScopeRule: RetainerRule; outOfScopeHourlyRate: Prisma.Decimal | null; }
export function activeAgreementOn(agreements: AgreementTerms[], workDate: Date): AgreementTerms | null;
export function defaultTreatment(agreement: AgreementTerms | null, serviceCategoryId: string | null): WorkEntryTreatment;
// covered (empty list or category included) → RETAINER; else outOfScopeRule: HOURLY→HOURLY, AT→AT, ABSORBED→RETAINER; no agreement → UNDECIDED

// retainer-allocation.ts
export interface AllocEntry { id: string; workDate: Date; createdAt: Date; minutes: number; serviceCategoryId: string | null; caseId: string | null; treatment: WorkEntryTreatment; }
export interface MonthProration { activeDays: number; daysInMonth: number; fee: Prisma.Decimal; includedMinutes: number | null; }
export function prorate(agreement: AgreementTerms, month: string /* YYYY-MM */): MonthProration | null; // null when 0 active days
export interface Allocation {
  feeEntryIds: string[];                       // covered, within cap (or ABSORBED overage)
  overage: { entryIds: string[]; minutes: number } | null; // priced minutes only
  outOfScope: { groupKey: string /* caseId or "cat:<id>" or "cat:none" */; entryIds: string[]; minutes: number }[];
}
export function allocate(agreement: AgreementTerms, proration: MonthProration, alreadyCoveredMinutes: number, entries: AllocEntry[]): Allocation;
export function priceMinutes(minutes: number, hourlyRate: Prisma.Decimal): Prisma.Decimal; // round half-up 2dp
```

Rules for `allocate`:
- `RETAINER` entries are "covered". Entries treated as `HOURLY`/`AT` are out of scope. `NON_BILLABLE` entries are ignored.
- Covered entries are sorted by `(workDate, createdAt)`. The running total starts at `alreadyCoveredMinutes`. An entry whose cumulative total exceeds `includedMinutes` goes to overage, and only its minutes above the cap count toward `overage.minutes`.
- `overageRule = ABSORBED` puts those entries into `feeEntryIds`, with `overage = null`.
- `prorate` returns:
  - `fee = monthlyFee × activeDays / daysInMonth`, rounded to 2 decimals
  - `includedMinutes = floor(includedMinutes × activeDays / daysInMonth)`
  - active days are the inclusive overlap of `[validFrom, validTo ?? ∞]` with the month

- [x] **Step 1: Write the failing tests:**
  - `defaultTreatment` covers all 4 branches.
  - `prorate`:
    - `validFrom 2026-09-15` for `2026-09`, fee 30000 → `{ activeDays: 16, daysInMonth: 30, fee: "16000.00" }`, cap 1200 → 640
    - an agreement ending 2026-08-31 for `2026-09` → `null`
  - `allocate`, with a 600-minute cap and covered entries of 300 (Sep 1), 200 (Sep 2), 200 (Sep 3):
    - `feeEntryIds = [e1, e2]`, `overage = { entryIds: [e3], minutes: 100 }`
    - with `alreadyCoveredMinutes = 550` and a single 120-minute entry: `overage.minutes = 70`
    - with ABSORBED: `overage = null` and all ids in `feeEntryIds`
    - out of scope groups by case, then by category
  - `priceMinutes(90, 6000) = "9000.00"` and `priceMinutes(10, 100) = "16.67"`.
- [x] **Step 2:** Run `npx nx test api --testFile=retainer-allocation.spec.ts`. Expected: FAIL (module not found).
- [x] **Step 3: Implement** `treatment.ts` and `retainer-allocation.ts` with the signatures above.
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): treatment defaults and retainer allocation`.

### Task 4: WorkEntriesService: CRUD, timer, confirm, write-off, permissions

**Files:**
- Create: `lib/work-entries.service.ts`, `lib/work-entries.dto.ts`, `lib/work-entries.controller.ts`
- Test: `apps/api/src/app/work-entries.service.spec.ts`, with the same mocked-`db` harness style as `financials.service.spec.ts`

**Interfaces:**
- Consumes: `activeAgreementOn` and `defaultTreatment` (Task 3); `PlatformPrismaService`; `WorkspaceContextService`; `transliterate` from `@law/transliteration`.
- Produces `WorkEntriesService` methods:
  - `list(query: WorkEntryQuery): Promise<PaginatedResponse<WorkEntry>>`
  - `get(id)`, `create(input: CreateWorkEntryRequest)`, `update(id, input: UpdateWorkEntryRequest)`
  - `confirm(id, input: { minutes: number; description?: string })`
  - `writeOff(id, reason: string)`, `remove(id)`: allowed only for own `PROPOSED`/`CONFIRMED`/`RUNNING` entries, or by a manager
  - `startTimer(input: StartTimerRequest)`, `stopTimer(): Promise<WorkEntry>`: the stopped entry stays `RUNNING` with `minutes` set to ceil(elapsed minutes) and `timerStartedAt` cleared, until `confirm` is called
  - `runningTimer(): Promise<WorkEntry | null>`
  - `afterConfirmed: (entry) => Promise<void>`: a hook filled in Task 8; defaults to a no-op
- Controller routes under `@Controller("work-entries")`:
  - `GET /`, `GET /:id`, `POST /`, `PATCH /:id`, `DELETE /:id`
  - `POST /:id/confirm`, `POST /:id/write-off`
  - `GET /timer`, `POST /timer/start`, `POST /timer/stop`

- [x] **Step 1: Write the failing tests:**
  - `create` sets `status CONFIRMED` and `treatment = defaultTreatment(...)` when `treatment` is omitted, and writes `WORK_ENTRY_CREATED`.
  - `create` rejects `minutes 0` and `1441` (400). It rejects a case whose `clientId` differs (400) and a client outside the workspace (400).
  - `update` on a `BILLED` entry → 409.
  - `startTimer` while another `RUNNING` entry exists → 409.
  - `stopTimer` after 61.2 minutes → `minutes 62`.
  - `writeOff` without a reason → 400. A MEMBER writing off someone else's entry → 403.
  - `list` as MEMBER always forces `userId = self`.
  - `list` as LAWYER returns own entries OR entries whose case has an active responsibility for the user (assert on the Prisma `where`).
  - With `aiParsed: true`, the activity-log metadata contains `source: "AI_ASSISTED"`.
- [x] **Step 2:** Run `npx nx test api --testFile=work-entries.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement** the service, DTOs (class-validator, `@IsInt() @Min(1) @Max(1440)` for minutes), and the controller with the guard set copied from `FinancialsController`.
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): entry CRUD, timer and permissions`.

### Task 5: Entries from completed work and logged activities

**Files:**
- Create: `lib/work-entry-sources.service.ts`
- Modify:
  - `activities-tasks-deadlines.service.ts` (`transitionTask`, `transitionEvent`, `transitionDeadline`, `updateTask` when the status becomes `DONE`) and its module
  - `cases.service.ts` `createActivity` + `cases.dto.ts` `CaseActivityDto`
  - `clients.service.ts` `createActivity` + `ClientActivityDto`
  - `work-entries.controller.ts`
- Test: `apps/api/src/app/work-entry-sources.service.spec.ts`; extend `activities-tasks-deadlines.service.spec.ts` and `cases.service.spec.ts`

**Interfaces:**
- Produces:

```ts
export class WorkEntrySourcesService {
  ensureForSource(tx: Prisma.TransactionClient, input: { workspaceId: string; actorUserId: string; sourceType: WorkEntrySourceType; sourceId: string; performerUserId: string; clientIds: string[]; caseId: string | null; workDate: Date; description: string; minutes: number | null; confirm: boolean }): Promise<string | null>;
  confirmFromSource(input: ConfirmSourceEntryRequest): Promise<WorkEntry>;
}
```

- `ensureForSource` behavior:
  - It returns `null` and writes nothing unless `new Set(clientIds).size === 1`.
  - It is idempotent on `(workspaceId, sourceType, sourceId)`: an existing entry is returned unchanged.
  - New entries are `CONFIRMED` when `confirm && minutes` is set, else `PROPOSED`.
- Route: `POST /work-entries/from-source` (body `ConfirmSourceEntryRequest`) → `confirmFromSource`:
  - It finds the entry by source (404 if none).
  - With `minutes` null it leaves the entry `PROPOSED`. Otherwise it confirms the entry, setting minutes and an optional description.
- `CaseActivityDto` / `ClientActivityDto` gain `@IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number`.
- For types `PHONE_CALL`/`MEETING`/`EMAIL`, `createActivity` calls `ensureForSource` with sourceType `CASE_ACTIVITY`/`CLIENT_ACTIVITY` and `confirm: true`. Other activity types create no entry.
- Event transitions to `COMPLETED` pass `minutes` = event duration, using the same 1–1440 rule as Task 1, with `confirm: false`.

- [x] **Step 1: Write the failing tests:**
  - `ensureForSource` with `clientIds []` → `null`, no `create` call.
  - With clientIds `[a, b]` → `null`.
  - With `[a, a]` → creates a `PROPOSED` entry. A second call returns the same id without a second `create`.
  - `transitionTask(id, "complete")` calls `ensureForSource` inside the same transaction with `performerUserId = assigneeUserId`.
  - A completed task with no client still transitions successfully.
  - Reopening and then completing again does not create a second entry.
  - Case `createActivity` with `type PHONE_CALL, durationMinutes 30` creates a `CONFIRMED` entry with `clientId = case.clientId`. A `NOTE` creates none.
  - `confirmFromSource` with `minutes 45` → `CONFIRMED`.
- [x] **Step 2:** Run `npx nx test api --testFile=work-entry-sources.service.spec.ts` (and the two extended spec files). Expected: FAIL.
- [x] **Step 3: Implement.** Import `WorkEntriesModule` into `ActivitiesTasksDeadlinesModule`, `CasesModule`, and `ClientsModule`, and inject `WorkEntrySourcesService`.
- [x] **Step 4:** Run the three spec files. Expected: PASS. Run `npx nx run api:build`. Expected: the only remaining errors are in `@law/financials`.
- [x] **Step 5: Commit** `feat(work-entries): create entries from completed work and logged activities`.

### Task 6: Billing setup: categories, retainers, profiles, rates, workspace config

**Files:**
- Create: `lib/billing-setup.service.ts`, `lib/billing-setup.controller.ts`
- Test: `apps/api/src/app/billing-setup.service.spec.ts`

**Interfaces:** routes under `@Controller("billing-setup")`. All writes are OWNER/ADMIN. Reads:
- categories: any member
- retainers and profiles: OWNER/ADMIN, plus LAWYER read-only
- rates: OWNER/ADMIN only

| Route | Behavior |
| --- | --- |
| `GET/POST /categories`, `PATCH /categories/:id` | name unique per workspace (409); deactivate instead of delete |
| `GET /clients/:clientId/retainers`, `POST /clients/:clientId/retainers`, `PATCH /retainers/:id`, `POST /retainers/:id/deactivate` | validates non-overlap with other active agreements of the client (409); `overageHourlyRate` required when `overageRule = HOURLY`, same for out of scope (400); currency in the supported list |
| `GET/PUT /clients/:clientId/profile` | upsert `ClientBillingProfile` |
| `GET /rates`, `POST /rates` | append-only `UserRate`; currency must equal `WorkspaceConfig.internalCurrency` (400) |
| `GET/PUT /workspace` | `WorkspaceBillingConfig` |

Also exports `BillingSetupService.agreementsForClient(clientId): Promise<AgreementTerms[]>`, used by Tasks 4, 8, and 10.

- [x] **Step 1: Write the failing tests:**
  - Overlapping agreements (`2026-01-01..open` vs `2026-06-01..2026-12-31`) → 409. Adjacent ones (`..2026-05-31` and `2026-06-01..`) → OK.
  - HOURLY without a rate → 400.
  - A rate in EUR when the internal currency is RSD → 400.
  - LAWYER `POST /retainers` → 403.
  - A duplicate category name → 409.
- [x] **Step 2:** Run `npx nx test api --testFile=billing-setup.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.** Wire `WorkEntriesService.create` to use `agreementsForClient` for the default treatment.
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): categories, retainers, client profiles and rates`.

### Task 7: AI free-text capture parser

**Files:**
- Create: `lib/work-capture-parser.ts`; add `POST /work-entries/parse` to the controller
- Test: `apps/api/src/app/work-capture-parser.spec.ts` (uses `FakeChatModelProvider` from `@law/llm`)

**Interfaces:**
- Produces `parseWorkCapture(provider: ChatModelProvider, input: { text: string; today: string; categories: ServiceCategory[] }): Promise<{ clientName: string | null; caseHint: string | null; minutes: number | null; categoryName: string | null; description: string | null }>`
  - It uses a zod schema with all fields nullable and `minutes` an int from 1 to 1440 or null.
  - The system prompt (Serbian) says: extract only what is stated, never invent a client; convert "pola sata" to 30, "sat i po" to 90, "dva sata" to 120; return the description in Serbian Latin as a short work note.
- The controller endpoint:
  1. Builds the provider like `resolveChatModelProvider`, but from env in a local `WorkCaptureModelConfig` (`OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`), using `MastraChatModelProvider` + `openRouterModel` from `@law/mastra`.
  2. Applies a 10-second `AbortSignal.timeout`.
  3. Resolves `clientName` and `caseHint` against workspace clients and cases with the same diacritic-insensitive matcher used by `assistant-office-reads.service.ts` (import it; if it is private, move it to `libs/api/core` and update both call sites).
  4. Returns `WorkCaptureParseResponse`:
     - an exact single match fills the id
     - several matches fill the `*Candidates` lists (max 5) and leave the id null
     - `categoryName` is matched to a category id case-insensitively
- On a missing key, a timeout, or a parse error, the endpoint returns `{ ok: false, ...all null, candidates [] }` with HTTP 200 and never throws.

- [x] **Step 1: Write the failing tests:**
  - A fake output `{ clientName: "Delta Medija", minutes: 30, categoryName: "pregled ugovora", ... }`, with one matching client and the category "Pregled ugovora" → `ok: true`, `clientId` set, `serviceCategoryId` set, `minutes 30`.
  - Two clients matching "Delta" → `clientId null`, two candidates.
  - A provider that throws → `ok: false`.
  - Output with `minutes: 2000` → `ok: false` (schema rejection).
- [x] **Step 2:** Run `npx nx test api --testFile=work-capture-parser.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): AI free-text capture parse endpoint`.

### Task 8: Notifications: long timer, review reminder, retainer usage

**Files:**
- Create: `lib/retainer-usage.service.ts`
- Modify: `notifications.service.ts` (`preferenceByType`), `notification-content.ts` (titles), `notification-reminder.service.ts`
- Test: `apps/api/src/app/retainer-usage.service.spec.ts`; extend `notifications.service.spec.ts`

**Interfaces:**
- Titles:
  - `TIMER_RUNNING_LONG: "Tajmer je i dalje uključen"`
  - `TIME_REVIEW_REMINDER: "Pregled današnjeg rada"`
  - `RETAINER_USAGE_80: "Paušal je iskorišćen 80%"`
  - `RETAINER_USAGE_100: "Paušal je u potpunosti iskorišćen"`
- `preferenceByType` keys: `timerRunningLong`, `timeReviewReminder`, `retainerUsage` (both usage types).
- `RetainerUsageService` produces:
  - `usage(clientId: string, month: string): Promise<RetainerUsage | null>`
  - `listUsage(month: string): Promise<RetainerUsage[]>`
  - `checkThresholds(entry: { clientId: string; workDate: Date }): Promise<void>`
- `checkThresholds` covers `CONFIRMED` + `BILLED` covered minutes against the prorated cap and notifies `client.responsibleUserId` (fallback: all active OWNERs), with `dedupeKey = "retainer:<agreementId>:<YYYY-MM>:80|100"`. It is wired as `WorkEntriesService.afterConfirmed`.
- Reminder runner additions (hourly tick):
  - Timers: a `RUNNING` entry whose `timerStartedAt` is ≥ 4 h ago, or which started before local midnight on the workspace timezone date, notifies its owner with `dedupeKey "timer:<entryId>:<startedAt ISO>"`.
  - Review reminder: for users with `timeReviewReminderEnabled`, on Mon–Fri, when the local time is ≥ `timeReviewReminderTime`, notify with `dedupeKey "time-review:<YYYY-MM-DD>"`.

- [x] **Step 1: Write the failing tests:**
  - A cap of 600 with 480 covered minutes confirmed → one `RETAINER_USAGE_80`. Confirming another 30 → no duplicate (the dedupe key is the same). Reaching 600 → `RETAINER_USAGE_100`.
  - An uncapped agreement → no notification.
  - Runner at 18:05 Belgrade on a Wednesday with time "17:30" → a reminder is created. On a Saturday → none.
  - A timer started 4 h 10 min ago → `TIMER_RUNNING_LONG`.
- [x] **Step 2:** Run `npx nx test api --testFile=retainer-usage.service.spec.ts` and `--testFile=notifications.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same commands. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): timer, review and retainer usage notifications`.

### Task 9: Financials bills work entries

**Files:**
- Modify: `financials.service.ts`, `financials.dto.ts`, `financials.controller.ts`, `financials.module.ts`
- Test: rewrite the affected cases in `apps/api/src/app/financials.service.spec.ts`

**Interfaces:**
- Removed: `listBillableWork`, `BillableWorkQueryDto`, `GET /financials/billable-work`, and every `event|task|deadline.statementId` update.
- `BillingStatementLineInputDto` changes:
  - `sourceType`/`sourceId` are replaced by `@IsOptional() @IsArray() @IsUUID("4", { each: true }) workEntryIds?: string[]` and `@IsOptional() @IsBoolean() pricingRequired?: boolean`
  - add `@IsOptional() @IsInt() minutes?: number`
- `CreateStatementDto`/`UpdateStatementDto` add `@IsOptional() @IsBoolean() printWorkSpecification?: boolean`.
- New statement helpers, each taking `tx` and the statement id:
  - `claimEntries(tx, statement, lineId, entryIds)`: an `updateMany` where `id in entryIds`, `workspaceId`, `clientId = statement.clientId`, `status = CONFIRMED`, `statementLineId = null`. If `count !== entryIds.length` → 409 `"Work entry is unavailable for the statement client"`. Sets `status BILLED`, `statementLineId`, and writes `WORK_ENTRY_BILLED`.
  - `releaseEntries(tx, statementId)`: for entries linked to the statement's lines, sets `status = CONFIRMED` when `minutes` is non-null, else `PROPOSED`, and clears `statementLineId`. Writes `WORK_ENTRY_UNBILLED`.
- Release runs in:
  - `replaceStatementLines` (before deleting lines)
  - `deleteStatement`
  - `voidStatement`, for both DRAFT and SENT statements (per spec: voiding a sent statement returns entries)
- `sendStatement` rejects with 409 `"Price every line before sending"` when any line has `pricingRequired`.
- The statement response includes per-line `workEntries` and `minutes`, plus `printWorkSpecification` and `billingMonth`.
- The duplicate check runs across all lines' `workEntryIds`: one entry may appear on only one line (409).
- New service-only helper for Task 10: `createDraftFromLines(tx, input: { clientId: string; currency: string; billingMonth: string; header: Pick<CreateStatementDto, "dateOfCreate" | "dateOfMaturity" | "dateOfTurnover" | "placeOfIssue" | "methodOfPayment" | "country" | "vatRate">; lines: BillingStatementLineInputDto[] }): Promise<string>`. It reuses the number counter and line creation, and is public on `FinancialsService` with no controller route.

- [x] **Step 1: Write the failing tests:**
  - Create with `workEntryIds [e1, e2]` on one line → one `updateMany` claiming both. A claim count of 1 → 409.
  - The same entry on two lines → 409.
  - `deleteStatement` releases entries.
  - `voidStatement` on SENT releases entries.
  - `sendStatement` with a `pricingRequired` line → 409.
  - The existing number/idempotency tests still pass.
- [x] **Step 2:** Run `npx nx test api --testFile=financials.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.** `FinancialsModule` imports `WorkEntriesModule`. `WorkEntriesModule` must not import `FinancialsModule`; Task 10 injects `FinancialsService` through a separate `BillingRunModule` inside the work-entries lib that imports both.
- [x] **Step 4:** Run the same command. Expected: PASS. Run `npx nx run api:build`. Expected: success.
- [x] **Step 5: Commit** `feat(financials): bill work entries instead of tasks, events and deadlines`.

### Task 10: Month-end billing run

**Files:**
- Create: `lib/month-end-run.service.ts`, `lib/billing-run.module.ts` (imports `WorkEntriesModule` + `FinancialsModule`; provides `MonthEndRunService`, `ProfitabilityService`, `BillingReportsController`), `lib/billing-reports.controller.ts`; register `BillingRunModule` in `AppModule`
- Test: `apps/api/src/app/month-end-run.service.spec.ts`

**Interfaces:**
- Routes (OWNER only, 403 otherwise):
  - `GET /billing/month-end/:month/precheck` → `MonthEndPrecheck`: entries in the month with status `PROPOSED`, or `CONFIRMED` + `UNDECIDED`, grouped by client
  - `POST /billing/month-end/:month/run` → `MonthEndRunResult`
- `run(month)`, per client that has confirmed unbilled non-`UNDECIDED` entries dated in the month, or an agreement active in the month. All of it happens inside one `$transaction` per client:
  1. **Partition** entries by currency target: retainer currency for `RETAINER` + out-of-scope entries; `ClientBillingProfile.currency` for non-retainer `HOURLY`; `AT` follows the retainer currency when an agreement exists, else the profile currency, else `internalCurrency`.
  2. **Find the draft:** for each currency, find a DRAFT statement with the same `clientId`, `billingMonth`, and `currency`, else create one via `createDraftFromLines`. The header uses:
     - `dateOfCreate` = today, `dateOfTurnover` = last day of the month, `dateOfMaturity` = today + `paymentTermDays`
     - `vatRate` = `defaultVatRate`
     - `placeOfIssue`/`methodOfPayment`/`country` copied from the client's latest non-voided statement, else `""` / `"Prenos na račun"` / `"Srbija"`
  3. **Build lines:**
     1. **Fee line:** `"Paušal za {mesec} {godina}"` (Serbian month name in the locative, e.g. "septembar"). When prorated, append ` (srazmerno, {activeDays}/{daysInMonth} dana)` ("prorated, X/Y days"). It is added only when the draft has no fee line yet (a line whose description starts with `"Paušal za"`). `workEntryIds = allocation.feeEntryIds`.
     2. **Overage line:** `"Prekoračenje paušala: {h} h {m} min"` ("retainer overage: H h M min"), priced via `priceMinutes`. With `AT`: amount 0 and `pricingRequired: true`.
     3. **Out-of-scope lines:** one per group. Description: `"{case.caseNumber} {case.name}"`, or the category name, or `"Ostali rad"` (other work). Priced the same way.
     4. **HOURLY lines** (non-retainer): grouped by case and priced at the profile rate. A missing rate gives amount 0 and `pricingRequired: true`.
     5. **AT lines:** grouped by case, amount 0, `pricingRequired: true`.
  4. **Re-runs:** `alreadyCoveredMinutes` is the sum of minutes of `BILLED` entries linked to the fee line of any statement with this `billingMonth` and client.
  5. **Concurrency:** claims use Task 9's `claimEntries`. A conflict rolls back that client only, and the result reports `created: false, addedLines: 0` for it.

- [x] **Step 1: Write the failing tests:**
  - **Capped HOURLY:** a client with a 20 h cap, 6000/h overage, and 21 h covered in September → a fee line plus an overage line `"Prekoračenje paušala: 1 h 0 min"` at `6000.00`.
  - **Re-run:** running again with one new 30-minute covered entry → the same statement, with an added overage line of 30 min. The fee line is not duplicated.
  - **Retainer starting 2026-09-15:** the fee is prorated and the description contains `"16/30 dana"`.
  - **EUR retainer + RSD hourly profile + an HOURLY entry with no agreement coverage:** two drafts (EUR and RSD).
  - **AT entries:** a line with `pricingRequired true`.
  - **Exclusions:** an `UNDECIDED` entry is not billed and appears in the precheck.
  - **Roles:** ADMIN → 403.
- [x] **Step 2:** Run `npx nx test api --testFile=month-end-run.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): owner month-end billing run`.

### Task 11: Usage list and profitability report

**Files:**
- Create: `lib/profitability.service.ts`; extend `billing-reports.controller.ts`
- Test: `apps/api/src/app/profitability.service.spec.ts`

**Interfaces:**
- Routes:
  - `GET /billing/retainers/usage?month=YYYY-MM` → `RetainerUsage[]` (OWNER/ADMIN; LAWYER only for clients where they are `responsibleUserId`)
  - `GET /billing/clients/:clientId/usage?month=` → `RetainerUsage | null`
  - `GET /billing/profitability?from&to` → `ProfitabilityReport` (OWNER/ADMIN)
- Profitability rules:
  - **Revenue:** the sum of line `netAmount` of `SENT` statements with `dateOfTurnover` in range, grouped by currency.
  - **Time value:** Σ `minutes/60 × UserRate.hourlyValue`, using the rate whose `effectiveFrom ≤ workDate` is latest, over `CONFIRMED` + `BILLED` entries with `workDate` in range. Minutes with no rate go to `unknownValueMinutes`.
  - **`comparable`:** true only when every revenue entry is in `internalCurrency`.
  - **`effectiveHourlyRate`:** `revenue(internal) / (minutes/60)` when comparable and minutes > 0, else null.
  - **Written-off and unbilled values:** priced by the same rate rule.
  - **Ordering:** rows sorted by `effectiveHourlyRate` ascending, with nulls last.
  - **`byPerson`:** logged minutes vs minutes of `BILLED` entries.

- [x] **Step 1: Write the failing tests:**
  - A client with revenue RSD 60 000 and 600 minutes by a user rated 3000/h → `timeValue "30000.00"`, `effectiveHourlyRate "6000.00"`, `comparable true`.
  - EUR revenue → `comparable false`, `effectiveHourlyRate null`.
  - A user with no rate → `unknownValueMinutes` counted and `timeValue` excluding them.
  - A rate change mid-range applies per `workDate`.
  - Ordering is worst first.
  - LAWYER `GET /billing/profitability` → 403.
- [x] **Step 2:** Run `npx nx test api --testFile=profitability.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(work-entries): retainer usage and profitability report`.

### Task 12: Seed data and backend docs

**Files:** modify `apps/api/prisma/seed-demo-data.cjs` and `.github/bussiness-logic-done-so-far.md`.

- [x] **Step 1: Extend the seed** with what spec §5 lists:
  - user rates for every demo user (partner 9000, lawyer 6000, trainee 2500 RSD)
  - `WorkspaceConfig.targetHourlyRate 7000`
  - one client with a capped retainer (20 h, 120 000 RSD, HOURLY overage 6000, out-of-scope AT)
  - one with an uncapped ABSORBED retainer (60 000 RSD)
  - one client with an hourly profile (EUR 120)
  - ~40 entries over the previous month, covering every source and status, including one `RUNNING`
  
  Remove the seed's `statementId` assignments.
- [x] **Step 2:** Run `npx prisma migrate reset --force --schema apps/api/prisma/schema.prisma && npm run db:seed:auth && npm run db:seed:demo`. Expected: completes without errors.
- [x] **Step 3: Update the business-logic doc.**
  - Replace the "Financials backend foundation" source description with work entries.
  - Add a "Work capture and retainers" section: entries, sources, timer, AI parse, review, retainers, month-end run, usage, profitability.
- [x] **Step 4: Commit** `chore(work-entries): demo seed and business-logic doc`.

### Task 13: Frontend API clients

**Files:**
- Modify: `libs/shared/frontend/api-clients/src/lib/api-clients.ts`
- Test: `libs/shared/frontend/api-clients/src/lib/api-clients.spec.ts`

**Interfaces:** produces three `@Injectable({ providedIn: "root" })` classes:
- `WorkEntriesApiClient`: methods named after the Task 4/5/7 routes (`list`, `get`, `create`, `update`, `remove`, `confirm`, `writeOff`, `runningTimer`, `startTimer`, `stopTimer`, `confirmFromSource`, `parse`, `review(date: string): Observable<TimeReviewResponse>`)
- `BillingSetupApiClient`: Task 6 routes
- `BillingReportsApiClient`: `usage`, `clientUsage`, `precheck`, `runMonthEnd`, `profitability`

Also: `FinancialsApiClient.billableWork` is removed. Case/client activity request types gain `durationMinutes?`.

Add `GET /work-entries/review?date=` to the backend controller in this task. It returns `TimeReviewResponse`:
- `missingEvents`: the user's events (organizer or assignee) on that date with status ≠ `CANCELLED` and no entry with that `sourceId`
- `untouchedClients`: clients from the user's activity-log rows, documents created, and chat sessions linked that day, with no entry dated that day

Add its test to `work-entries.service.spec.ts`: an event with an entry is excluded, and a client with an activity-log row but no entry is listed with reason `ACTIVITY`.

- [x] **Step 1: Write the failing tests:**
  - api-clients: `HttpTestingController` expects `POST /api/work-entries/from-source` and `GET /api/billing/profitability?from=2026-09-01&to=2026-09-30`.
  - backend: the review tests above.
- [x] **Step 2:** Run `npx nx test api-clients` and `npx nx test api --testFile=work-entries.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same commands. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): work entry, billing setup and report API clients`.

### Task 14: Quick-capture dialog, AI fill, header timer

**Files:**
- Create: `features/time/quick-capture/*`, `features/time/timer/work-timer.store.ts`, `features/time/timer/header-timer.component.ts`
- Modify: `layout/header/header.component.{ts,html}`, the localization dictionaries
- Test: `quick-capture-dialog.component.spec.ts`, `work-timer.store.spec.ts`

**Interfaces:**
- Produces:

```ts
export interface QuickCaptureInput { clientId?: string; caseId?: string; minutes?: number; description?: string; workDate?: string; mode: "create" | "confirm-timer" | "confirm-source" | "edit"; entryId?: string; source?: { sourceType: WorkEntrySourceType; sourceId: string }; }
@Injectable({ providedIn: "root" }) export class QuickCaptureDialogService { open(input?: QuickCaptureInput): Observable<WorkEntry | null>; }
@Injectable({ providedIn: "root" }) export class WorkTimerStore { readonly running: Signal<WorkEntry | null>; readonly elapsedSeconds: Signal<number>; load(): void; start(req: StartTimerRequest): void; stop(): void; /* stop opens QuickCaptureDialogService in mode "confirm-timer" */ }
```

- Dialog form (typed reactive form):
  - `clientId` (required; searchable combobox; recent clients first from the user's last 20 entries)
  - `caseId` (constrained to the client; it clears when the client changes, as in the task dialog)
  - `minutes`: chips 15/30/60/120 plus custom number, `Validators.min(1)`, `max(1440)`
  - `workDate` (default today), `description` (required)
  - `serviceCategoryId` and `treatment` selects, with `createSelectItemToString`
  - Treatment is pre-filled by calling `GET /billing-setup/clients/:id/retainers` when the client changes, then applying the same `defaultTreatment` rules client-side, ported into `features/time/treatment.ts`
- The free-text field above the form has a mic button that reuses `core/speech/speech-recognition.service.ts`, and a "Popuni" (fill) button that calls `parse`:
  - It shows `HlmSpinner` while waiting.
  - `ok:false` shows the hint `"Nisam razumeo, popunite ručno."` (I didn't understand, please fill in manually) and leaves the form untouched.
  - Candidates render as chips to pick from.
  - It sets `aiParsed = true` only when parse filled at least one field.
- Save, per mode:
  - `create`: `create` with `source "QUICK_CAPTURE"` when the text was parsed, else `"MANUAL"`
  - `confirm-timer`: `update` + `confirm` on the timer entry
  - `confirm-source`: `confirmFromSource`
  - `edit`: `update`
- Header: a "Zabeleži rad" (log work) button opens the dialog. Shortcut `Alt+W` is registered in `MainLayoutComponent` via `host: { "(document:keydown.alt.w)": ... }`. `HeaderTimerComponent` shows the client name + `hh:mm:ss` with a stop button, or a start button that opens a small client picker.

- [x] **Step 1: Write the failing tests:**
  - The dialog is invalid without a client.
  - The 30 chip sets `minutes 30`.
  - A parse `ok:false` leaves the values and shows the hint.
  - A parse with a single client sets `clientId` and `aiParsed`.
  - Changing the client clears the case.
  - Timer store: `elapsedSeconds` ticks from `timerStartedAt` with fake timers, and `stop()` opens the dialog in `confirm-timer` mode.
- [x] **Step 2:** Run `npx nx test web --testFile=quick-capture-dialog.component.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run both spec files. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): quick work capture, AI fill and header timer`.

### Task 15: Completion prompt and activity durations

**Files:**
- Create: `features/time/completion-prompt/completion-prompt.service.ts`
- Modify:
  - `work-view.component.ts` (after a successful `task-complete`)
  - every success handler for event complete and deadline satisfy (find them with `grep -rn "completeTask\|satisfyDeadline\|eventsApi.complete\|\.complete(" apps/web/src/app --include=*.ts`)
  - `case-detail.component.ts` and `client-detail.component.ts` activity forms
- Test: `completion-prompt.service.spec.ts`

**Interfaces:**
- Produces `CompletionPromptService.prompt(source: { sourceType: "TASK" | "EVENT" | "DEADLINE"; sourceId: string; title: string; defaultMinutes?: number }): void`.
  - It shows a Spartan toast-style panel (bottom-right, reusing `HlmSonner` if present, else a small dialog) titled `"Koliko vremena?"`, with chips 15/30/60/120, "Drugo…" (other), and "Preskoči" (skip).
  - A chip calls `confirmFromSource({ minutes })`.
  - "Drugo…" opens `QuickCaptureDialogService` in mode `confirm-source`.
  - "Preskoči" calls nothing, because the backend already created the `PROPOSED` entry.
  - For events, `defaultMinutes` = event duration.
- Activity forms get an optional `durationMinutes` control, shown only for `PHONE_CALL`/`MEETING`/`EMAIL`, with chips.

- [x] **Step 1: Write the failing tests:**
  - The 30 chip posts `{ sourceType: "TASK", sourceId, minutes: 30 }`.
  - Skip posts nothing.
  - "Drugo…" opens the dialog with `mode: "confirm-source"`.
- [x] **Step 2:** Run `npx nx test web --testFile=completion-prompt.service.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement** and wire every call site found by the grep.
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): time prompt on completion and activity durations`.

### Task 16: My time, Team time, and end-of-day review

**Files:**
- Create: `features/time/my-time.component.*`, `team-time.component.*`, `time-review.component.*`
- Modify: `app.routes.ts` (add `work/time`, `work/time/team`, `work/time/review` **before** `work/:mode`), `layout/sidebar/sidebar.component.html`, `features/settings/profile-settings.component.*` (review reminder toggle + time input, saved through user settings; add the two fields to the user-settings DTO and contract)
- Test: `time-review.component.spec.ts`, `my-time.component.spec.ts`

**Interfaces:**
- My time:
  - A week grid (Mon–Sun) of the user's entries with `‹ Danas ›` (today) navigation, per-day and per-client totals, and status badges.
  - Clicking an entry opens the dialog in `edit` mode. `BILLED` entries are read-only.
- Team time: OWNER/ADMIN only (route guard via the current user's role from the auth store). A paginated table with filters for person, client, case, status, treatment, and date range. Row actions: edit, write off (a confirm dialog with a required reason).
- Review (`?date=`, default today): three sections, each with its own loading/empty state:
  - "Današnji unosi" (today's entries)
  - "Za potvrdu" (to confirm: `proposed`; actions Potvrdi (confirm, opens the dialog pre-filled), Otpiši (write off), Obriši (delete))
  - "Možda nedostaje" (possibly missing: `missingEvents` → "Zabeleži" (log) opens the dialog in `confirm-source` mode for the event; `untouchedClients` → "Zabeleži" opens the dialog with the client prefilled; "Zanemari" (dismiss) hides the item for that date in `localStorage` key `time-review-dismissed:<date>`, wrapped in try/catch)
- Sidebar: a "Moje vreme" (my time) entry under work; "Tim — vreme" (team time) for managers.
- Notification types `TIME_REVIEW_REMINDER` and `TIMER_RUNNING_LONG` navigate to `/work/time/review` and `/work/time`. Add these mappings in the notification store's navigation, and add the three new preference switches to workspace notification settings.

- [x] **Step 1: Write the failing tests:**
  - Review renders three sections from a mocked `TimeReviewResponse`.
  - Dismiss hides an item and survives a component re-create.
  - Confirm on a proposed entry opens the dialog with its values.
  - The My time week total sums minutes.
- [x] **Step 2:** Run `npx nx test web --testFile=time-review.component.spec.ts` and `--testFile=my-time.component.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same commands. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): my time, team time and end-of-day review`.

### Task 17: Billing settings, client retainer card, retainers list

**Files:**
- Create: `features/settings/billing-settings.component.*`, `features/clients/client-retainer-card/*`, `features/finance-retainers/retainers.component.*`
- Modify: the settings nav/routes (`settings/billing`), `client-detail.component.*`, the finance routes (`finance/retainers`)
- Test: `client-retainer-card.component.spec.ts`, `billing-settings.component.spec.ts`

**Interfaces:**
- Billing settings (OWNER/ADMIN):
  - Workspace: `targetHourlyRate`, `internalCurrency`, `defaultVatRate`, `paymentTermDays`. The target field has the hint "npr. iznos tarifnog broja za sat rada iz Advokatske tarife" (e.g. the AT hourly tariff item amount). See the note at the end of this plan.
  - Service categories: list, add, rename, activate/deactivate, reorder up/down.
  - User rates: a table of users with their current rate, plus "Nova stopa" (new rate: amount + effective-from).
- Client retainer card on client detail (overview tab):
  - Shows the active agreement summary and this month's `RetainerUsage`: an `HlmProgress` bar of covered/included hours, a warning style at ≥ 80%, out-of-scope hours, and effective vs target rate (managers only).
  - Managers get "Uredi paušal" (edit retainer), which opens an agreement form with all spec §2 fields; the rate fields are required when the rule is HOURLY. They also get "Satnica klijenta" (client hourly rate, the `ClientBillingProfile`).
  - Without an agreement it shows "Bez paušala" (no retainer) plus the create action.
- Finance → Retainers: a month picker and a `RetainerUsage[]` table sorted by usage %, with each row linking to the client.

- [x] **Step 1: Write the failing tests:**
  - The card shows `16 / 20 h` and the warning class at 80%.
  - The agreement form is invalid with `overageRule HOURLY` and an empty rate.
  - The billing settings rate form posts `{ userId, hourlyValue, currency, effectiveFrom }`.
- [x] **Step 2:** Run the two spec files. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the two spec files. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): billing settings, client retainer card and retainers list`.

### Task 18: Unbilled work, statement composer, print specification, month-end page

**Files:**
- Modify: `features/finance-work-review/*` (becomes "Neobračunat rad", unbilled work), `features/finance-statements/billing-statement-line-import-dialog.*`, `billing-statement-form.ts`, `finance-statement-create.component.*`, `finance-statement-detail.component.*`, `invoice-print-view.component.*`
- Create: `features/finance-month-end/month-end.component.*`; route `finance/month-end` (OWNER only)
- Test: `month-end.component.spec.ts`, `billing-statement-form.spec.ts` (create the file if absent), `invoice-print-view.component.spec.ts`

**Interfaces:**
- Unbilled work:
  - Lists `WorkEntriesApiClient.list({ statuses: ["CONFIRMED"], unbilledOnly: true, ... })`, filtered by client (multi), case, person, treatment, and date.
  - Selecting entries of one client → "Novi obračun" (new statement), navigating with `?workEntryIds=` to statement create.
- Import dialog lists unbilled confirmed entries of the statement's client. Each imported entry becomes one line:
  - `workEntryIds [id]`, `minutes`
  - description `"{description} ({h} h {m} min)"`
  - `netAmount` = `priceMinutes` at the client profile rate when the treatment is HOURLY, otherwise 0 with `pricingRequired: true`
- Line form:
  - Editing `netAmount` to > 0 clears `pricingRequired`.
  - A badge "Cena nije uneta" (price not entered) marks flagged rows.
  - The send button is disabled with a tooltip while any row is flagged.
- The statement form gets a `printWorkSpecification` checkbox (default on).
- Print view: when `printWorkSpecification` is on, append a table "Specifikacija rada" (work specification) with columns Datum (date), Izvršilac (performer), Opis (description), Trajanje (duration), flattened from all lines' `workEntries` sorted by date, with a total duration row.
- Month-end page:
  - A month picker (default: previous month).
  - Step 1 is the precheck table per client with inline Potvrdi (confirm, dialog)/Otpiši (write off).
  - "Generiši nacrte" (generate drafts) is enabled when the precheck is loaded. It asks for confirmation when open items remain.
  - The result table links each statement (created/updated, lines added, lines to price).

- [x] **Step 1: Write the failing tests:**
  - Editing the amount on a flagged row clears `pricingRequired`.
  - Send is disabled while flagged.
  - Print renders `"Specifikacija rada"` rows when the flag is on and none when off.
  - The month-end page calls `runMonthEnd("2026-09")` after confirmation and renders the result rows.
- [x] **Step 2:** Run the three spec files. Expected: FAIL.
- [x] **Step 3: Implement.** Delete the remaining `billableWork` usage.
- [x] **Step 4:** Run the three spec files. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): unbilled work, entry-based statements and month-end run`.

### Task 19: Profitability report page

**Files:**
- Create: `features/reports/profitability/profitability.component.*`
- Modify: `reports.component.*` (a link/card to "Profitabilnost", OWNER/ADMIN only) and routes (`reports/profitability`)
- Test: `profitability.component.spec.ts`

**Interfaces:**
- Range presets: prošli mesec (last month, the default), ovaj mesec (this month), poslednja 3 meseca (last 3 months), and custom.
- The client table has these columns:
  - client
  - hours
  - revenue (per currency)
  - time value
  - effective rate vs target, colored with semantic tokens (`text-destructive` below target)
  - written off
  - unbilled
- The table notes:
  - `comparable false` → "nije uporedivo" (not comparable)
  - `unknownValueMinutes > 0` → "vrednost nepoznata za X h" (value unknown for X h)
  - a footer note: "Prihod = poslati obračuni; uplate se još ne prate." (revenue = sent statements; payments are not tracked yet)
- The person tab: logged vs billed hours and utilization %.

- [x] **Step 1: Write the failing tests:**
  - Rows render in API order.
  - A row below target has `text-destructive`.
  - `comparable false` shows "nije uporedivo".
- [x] **Step 2:** Run `npx nx test web --testFile=profitability.component.spec.ts`. Expected: FAIL.
- [x] **Step 3: Implement.**
- [x] **Step 4:** Run the same command. Expected: PASS.
- [x] **Step 5: Commit** `feat(web): profitability report`.

### Task 20: Full verification and track close-out

- [x] **Step 1: Lint.** Run `npx nx run-many -t lint -p api web api-interfaces api-clients`. Expected: no errors. Result: only the pre-existing failures that also fail on `main` (web: 2 errors in `matter-link.component.ts` selector and `sidebar.component.html` empty button; `api-clients` `@nx/dependency-checks`). No lint finding comes from this track's files.
- [x] **Step 2: Test.** Run `npx nx run-many -t test -p api web api-interfaces api-clients`. Expected: all pass. Result: `api`, `api-interfaces` and `api-clients` pass; the web run's only failure is the pre-existing, date-dependent `documents.component.spec.ts` "addedThisMonth" assertion.
- [x] **Step 3: Build.** Run `npx nx run-many -t build -p api web`. Expected: success. Result: `api` builds; `web` development build succeeds; the production `web` build only fails the initial-bundle budget (2.02 MB against 1.75 MB), which `main` already exceeds.
- [x] **Step 4: Manual smoke test** (`npm run api:serve`, `npm run web:serve`, demo seed, logged in as owner):
  1. Alt+W → log 30 min → it appears in My time.
  2. Complete a task → chip 1 h → the entry is CONFIRMED.
  3. Start and stop the timer → confirm.
  4. Run month-end for last month → open the capped client's draft and check the overage line.
  5. Print the draft and check the specification table.
  6. Open the profitability report.
  
  Record the results in the PR description.

  Smoke results (2026-10-04, scratch DB `law_platform_sdd`, owner login, Playwright/Chromium, UI in Serbian; all six passed): (1) Alt+W capture of 30 min for Beogradska tekstilna industrija a.d. appeared in My time as Potvrđeno, week total 30m; (2) completing "Priprema za ročište" and choosing the 60 min chip created a 1h entry, Potvrđeno; (3) header timer start for Grand Nekretnine, stop, confirm dialog saved a Potvrđeno entry (1m, the minimum); (4) month-end for 2026-09 (precheck listed 4 open entries, generation confirmed) created drafts for Alfa Trade, Beogradska tekstilna industrija, Dunav Logistika and Nova Energija (EUR); the capped Alfa Trade draft ST-000001 shows "Paušal za septembar 2026" 120.000,00 and "Prekoračenje paušala: 0 h 15 min" 1.500,00; (5) the print view shows the invoice and, after it, the "Specifikacija rada" table with 16 entries and "Ukupno trajanje 23 h 25 min"; (6) the profitability page lists the four clients with hours, time value, target 7.000 RSD, written-off and unbilled amounts, and revenue shown as unavailable ("—") because the drafts are not sent. AI free-text parse was not exercised; the manual path is what was verified.
- [x] **Step 5: Close out the track.** Set `metadata.json` `status` to `completed` and update `updated_at`. Move the `delivery/index.md` link to Completed. Commit `chore(delivery): close work_capture_retainers_20261004`.

## Note on the target hourly rate default

Spec §2 says the settings UI defaults the target to the AT hourly tariff item amount. The tarifa is not in the local corpus snapshot (`tmp/legal-corpus/legal-corpus-2026-09-27.ndjson.gz` has 33 sources and no tarifa), and this plan does not guess the amount. So `targetHourlyRate` starts empty, and the field shows a hint pointing to the AT item. Profitability works without a target and only omits the comparison.

## Final review fixes

- [x] Month-end rows report `conflict` (reason) and `attachedEntries`; the web page shows "Nije obračunato: {razlog}" and "Dodato u postojeći paušal: N" instead of "Bez promena".
- [x] Retainer fee lines are marked `sourceType` `RETAINER_FEE` / `sourceId` = agreement id (service-only line input, not in the public DTO); detection no longer uses the description, and the composer keeps the marker on save.
- [x] `GET /activity-log` excludes `WORK_ENTRY` rows (also covers the dashboard feed and the assistant activity tool).
- [x] A task created as `DONE` creates its entry (`CreateDeadlineDto` and `CreateEventDto` have no status, so nothing else to cover).
- [x] `ensureForSource` inserts with `createMany({ skipDuplicates })` and reads back, so a concurrent completion cannot abort the transaction.
- [x] Migration backfill keeps billed tasks and deadlines with conflicting task/case clients under the statement's client; the conflict guard only drops unbilled sources.
- [x] The fee marker now survives composer edits by line identity: `BillingStatementLineInput` carries an optional `id`, `replaceStatementLines` re-applies the `RETAINER_FEE` marker only to input ids that match marked lines of the same statement (unknown ids ignored, removed fee lines drop the marker), and the position/amount guessing (`carryOverFeeMarkers`) is gone. The composer keeps each loaded line's `id` and sends it on save.
- Product rule (owner-confirmed 2026-10-04): out-of-scope work under an `ABSORBED` out-of-scope rule is treated as retainer work and counts toward the agreement's included hours.
