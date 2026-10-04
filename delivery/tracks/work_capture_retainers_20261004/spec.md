# Work Capture, Retainers, and Month-End Billing — Specification

**Track:** `work_capture_retainers_20261004` · **Type:** epic · **Parent:** none
**Agreed:** 2026-10-04 (brainstorming session with the office owner)

## 1. Why

The target office (6 lawyers plus trainees; mostly company clients; contracts and media law) loses the most money to **work that is never billed**: calls, Viber messages, emails, and small favors for retainer clients that nobody records. Second is **slow collection**, third is **lawyer time spent on low-value work**.

Revenue is roughly 50% monthly retainers (*paušal*) and 50% per-action Advokatska tarifa (AT). Retainer terms are negotiated per client: some have an hour cap, some a list of covered services, some neither.

Today:

- Billing only sees completed tasks, events, and deadlines (`statementId` on each). Calls and emails logged as `ClientActivity`/`CaseActivity` have no duration and never reach billing.
- No record holds time or effort, so nobody can tell whether a retainer client is profitable.
- There is no retainer concept at all.

### Goal

Record (almost) all work with minimal friction, bill retainer overage and out-of-scope work every month, and show partners which clients are unprofitable.

### Success criteria

- Logging a piece of work takes under 10 seconds from anywhere in the app.
- Completing a task or event, or logging a call/meeting/email activity, can never silently drop billable work: it creates a confirmed or a proposed entry.
- At month end, the owner gets one draft statement per client with retainer fee, overage, and out-of-scope work already assembled, and no confirmed entry is left out.
- Partners see, per client, revenue vs internal value of time and the effective hourly rate vs the office target.
- No AI is required for any of the above. AI only speeds up free-text capture.

### Where the evidence of work lives (decides capture design)

- **Outlook email:** primary trace. Mail hosting (Microsoft 365 vs IMAP) is unknown, so the Outlook connector is a later sub-project.
- **Phone and Viber:** no usable API for personal chats or call logs. Covered by fast manual and voice capture.
- **The lawyer's memory:** covered by the optional end-of-day review.

## 2. Data model

### `WorkEntry` (new): the single billable unit

| Field | Notes |
| --- | --- |
| `workspaceId` | scoping, as everywhere |
| `userId` | performer (lawyer or trainee) |
| `clientId` | required |
| `caseId` | optional; must belong to `clientId` |
| `workDate` | date |
| `minutes` | int 1–1440; required for `CONFIRMED`, nullable for `PROPOSED`/`RUNNING` |
| `timerStartedAt` | set while `RUNNING` |
| `description` | text, Serbian Latin (`@law/transliteration`) |
| `serviceCategoryId` | optional |
| `treatment` | `RETAINER` \| `AT` \| `HOURLY` \| `NON_BILLABLE` \| `UNDECIDED` |
| `status` | `RUNNING` \| `PROPOSED` \| `CONFIRMED` \| `BILLED` \| `WRITTEN_OFF` |
| `writeOffReason` | required when `WRITTEN_OFF` |
| `source` | `MANUAL` \| `TIMER` \| `QUICK_CAPTURE` \| `TASK` \| `EVENT` \| `DEADLINE` \| `ACTIVITY` (later `EMAIL`) |
| `sourceType`, `sourceId` | unique per workspace when set, so one source yields at most one entry |
| `statementLineId` | set when `BILLED` |
| `aiParsed` | true when the form was filled by AI capture |
| audit columns | `createdByUserId`, `updatedByUserId`, timestamps |

Rules:

- At most one `RUNNING` entry per user (partial unique index).
- `treatment` defaults from the client's active retainer on `workDate`: a covered category (or no category restriction) → `RETAINER`; otherwise the retainer's out-of-scope rule; no retainer → `UNDECIDED`. The user can override it.
- `BILLED` entries are immutable. Removing their line from a draft statement, deleting the draft, or voiding a sent statement returns them to `CONFIRMED`.

### `ServiceCategory` (new)

A workspace list (name, active flag, order). Seeded with: *Korporativno savetovanje*, *Pregled ugovora*, *Izrada ugovora*, *Medijsko pravo*, *Parnica*, *Upravni postupak*, *Ostalo*. Editable in workspace settings by OWNER/ADMIN.

### `RetainerAgreement` (new)

| Field | Notes |
| --- | --- |
| `clientId` | a client may have several, non-overlapping in time |
| `title` | e.g. "Paušal 2026" |
| `monthlyFee`, `currency` | Decimal(18,2), ISO code from the supported-currency list |
| `validFrom`, `validTo` | `validTo` nullable (open-ended) |
| `includedMinutes` | nullable = no cap |
| covered categories | join table to `ServiceCategory`; empty = covers everything |
| `overageRule` | `HOURLY` \| `AT` \| `ABSORBED` |
| `overageHourlyRate` | required when `overageRule = HOURLY` |
| `outOfScopeRule` | `HOURLY` \| `AT` \| `ABSORBED` |
| `outOfScopeHourlyRate` | required when `outOfScopeRule = HOURLY` |

### `ClientBillingProfile` (new)

One per client, optional: `hourlyRate` and `currency`. It prices `HOURLY` entries for clients without a retainer.

### Rates

- `UserRate` (new): `userId`, `hourlyValue`, `currency`, `effectiveFrom`. This is the internal value of an hour of that person's time, used only for profitability. Managed by OWNER/ADMIN.
- `WorkspaceConfig.targetHourlyRate` + `targetCurrency`: the office target. The settings UI defaults the field to the AT hourly tariff item amount, which the owner can change.

### Changes to existing tables

- `Task.statementId`, `Event.statementId`, `Deadline.statementId` are removed. Billing goes through `WorkEntry.statementLineId`.
- `ClientActivity` / `CaseActivity` stay as the journal. Logging a `PHONE_CALL`, `MEETING`, or `EMAIL` activity with a duration creates a linked entry (`source = ACTIVITY`).
- `BillingStatementLine` keeps `sourceType`/`sourceId`. New lines generated from entries use `sourceType = "WORK_ENTRY_GROUP"` and are linked through the entries' `statementLineId`.
- `BillingStatement` gets `printWorkSpecification` (boolean, default true).

## 3. Capture flows

All flows share one quick-capture form component.

1. **Quick capture.** A header button plus keyboard shortcut, also usable on mobile. Fields:
   - client (searchable, recent clients first)
   - optional case (constrained to the client)
   - duration chips: 15m / 30m / 1h / 2h / custom
   - description
   - category and treatment, pre-filled from the retainer
   
   Save creates a `CONFIRMED` entry.
2. **Free-text / voice capture** inside the same form. The user types or dictates one sentence (existing speech input). A synchronous structured `ChatModelProvider` call parses it into client, case, minutes, category, and description, and fills the form. Nothing is saved until the user presses Save. If the model is unavailable, times out, or returns invalid output, the form stays as it was and shows a short "fill in manually" hint. Client/case matching reuses the diacritic-insensitive matching from the assistant tools. An ambiguous match leaves the field empty with candidates shown.
3. **Header timer.**
   - Start (on a chosen client/case), stop, or switch.
   - Stopping opens the form pre-filled with elapsed minutes, rounded up to the next minute.
   - A timer still running after 4 hours, or at local midnight, triggers an in-app notification (new notification type `TIMER_RUNNING_LONG`).
4. **Completion prompt.**
   - Completing a task or event, or satisfying a deadline, shows an inline "Koliko vremena?" chip row. Events pre-fill from start/end. Saving creates a `CONFIRMED` entry; "Skip" creates a `PROPOSED` entry without minutes.
   - The same happens when logging a `PHONE_CALL`/`MEETING`/`EMAIL` activity.
   - Reopening the source does not delete the entry. Re-completing does not create a second one.
5. **End-of-day review** at `/work/time/review`. Shows:
   - today's entries
   - all open `PROPOSED` entries
   - "possibly missing" hints: today's events with no entry, and clients the user touched today (activities, document uploads, linked chat sessions) with no entry
   
   Each row can be confirmed, edited, written off, or dismissed in one click. A per-user setting turns on a daily reminder notification (default off, configurable time; new type `TIME_REVIEW_REMINDER`).
6. **Time views.**
   - **My time** (`/work/time`): a week grid of the user's entries, with totals per day and per client.
   - **Team time** (`/work/time/team`): OWNER/ADMIN only, filtered by person, client, case, status, treatment, and date range.

### Permissions

- Every user creates and edits their own non-billed entries.
- OWNER/ADMIN see and edit all entries, manage categories, retainers, rates, and write-offs.
- LAWYER also sees (read-only) entries on cases where they are a current responsible user, which is how they review trainee work.
- MEMBER sees only their own entries.
- Profitability and rates are OWNER/ADMIN only.

## 4. Month end

### Retainer usage

- **Where:** a "Paušal" card on client detail, plus a Finance → Retainers list.
- **Per client per month:** used vs included hours, out-of-scope hours, and effective hourly rate (fee ÷ hours) vs target.
- **Alerts:** a notification to the client's responsible lawyers at 80% and 100% of the cap. New types `RETAINER_USAGE_80` and `RETAINER_USAGE_100`, each deduped per agreement and month.

### Month-end billing run (Finance → "Obračun meseca"; OWNER only)

1. The owner picks a month. A **pre-check** lists, per client, entries still `PROPOSED` or `UNDECIDED` in that month, with inline confirm/edit/write-off, so nothing silently falls out.
2. **Generate** creates one draft `BillingStatement` per client that has confirmed unbilled entries in the month or an active retainer. Lines:
   1. **Retainer fee:** "Paušal za {mesec} {godina}". If the agreement starts or ends mid-month, the fee is prorated by days and the line says so.
   2. **Overage:** minutes of covered work above `includedMinutes`, priced by `overageRule`. Overage is allocated in chronological order. `ABSORBED` produces no line, but the entries are still marked `BILLED` against the fee line.
   3. **Out-of-scope work:** grouped by case (or by category when there is no case), priced by `outOfScopeRule`.
   4. **Non-retainer `HOURLY` entries:** grouped by case and priced by `ClientBillingProfile.hourlyRate`.
   5. **`AT` entries:** grouped by case with an **empty amount** and a "cenu unesti" flag. Automatic tariff pricing is sub-project #2. The statement cannot be sent while a flagged line has no amount.
3. Every line keeps its entries (`statementLineId`). With `printWorkSpecification` on (default), the A4 print view appends a *specifikacija rada* table: date, performer, description, duration.
4. **Idempotent:** re-running a month never touches entries that are already billed and only adds new confirmed entries. If the client already has a draft statement for that month, the new lines are added to it instead of creating a second draft. Entries are claimed inside a transaction with a status check, so concurrent runs cannot double-bill.
5. Nothing is sent automatically. Drafts open in the existing statement composer and print view.

The existing Work Review screen becomes **"Neobračunat rad"**. It lists confirmed unbilled entries instead of tasks/events/deadlines and keeps the "select → new statement" path for ad-hoc billing outside the monthly run.

### Profitability report (Reports → "Profitabilnost"; OWNER/ADMIN)

- **Per client, for a month or a date range:**
  - revenue: net of SENT statements (payments are not tracked yet; the report states this)
  - internal value of time: Σ minutes × the performer's `UserRate` effective on `workDate`
  - effective hourly rate vs target
  - hours
  - written-off value
  - confirmed-but-unbilled value
- Sorted by effective rate ascending, so the worst clients come first.
- **Client drill-down:** hours and value per person, and the lawyer vs trainee split.
- **Per-person tab:** logged vs billed hours (utilization).
- Entries whose performer has no `UserRate` count hours but show "vrednost nepoznata" (value unknown) instead of a guessed value.

## 5. Migration

One Prisma migration plus a data step:

1. Every unbilled `DONE` task, `COMPLETED` event, or `SATISFIED` deadline that resolves to exactly one client becomes a `PROPOSED` `WorkEntry`:
   - performer: the assignee, organizer, or responsible user
   - `minutes`: taken from the event duration, otherwise null
   - `source`: the record type
2. Every source with `statementId` set becomes a `BILLED` entry linked to the statement line with the matching `sourceType`/`sourceId`.
3. The `statementId` columns and the eligible-work endpoint are dropped. The API client and UI switch to the entries endpoint.
4. `seed-demo-data.cjs` gets:
   - categories
   - user rates for every demo user
   - one capped retainer (20 h, HOURLY overage) and one uncapped (`ABSORBED`, out-of-scope AT)
   - a month of entries across sources and statuses

## 6. Error handling and integrity

- Server-side validation for:
  - workspace membership of the client, case, and user
  - case-belongs-to-client
  - minutes range by status
  - allowed status transitions
  - non-overlapping retainer validity per client
  - the rate required by an `HOURLY` rule
- `BILLED` entries reject edits (409).
- AI capture never writes. It only returns a suggestion, and the save endpoint is the same as manual entry.
- Every entry create, confirm, edit, write-off, bill, and unbill writes an `ActivityLog` row. AI-parsed entries carry `metadata.source = "AI_ASSISTED"`.
- All queries are scoped by `WorkspaceContextService.required`.

## 7. Testing

- **Backend specs** (the first feature specs under `libs/api/features` for finance):
  - default treatment
  - retainer allocation: cap, overage ordering, out of scope, absorbed, mid-month start/end proration, month boundaries, overlapping-agreement rejection
  - billing-run idempotency and concurrency guard
  - unbill on line delete / statement void
  - migration mapping
  - role permissions
  - profitability math with missing rates
- **Frontend specs:** quick-capture form (manual, AI-filled, AI failure), timer store, completion prompt, end-of-day review actions, month-end pre-check.
- **AI parser:** fixture-based tests with a mocked `ChatModelProvider`.

## 8. Out of scope (later sub-projects)

Roadmap order agreed 2026-10-04. It supersedes the unmerged `modernization_roadmap_20260927` ordering.

1. **This track:** work capture, retainers, month-end run, profitability.
2. **AT auto-pricing:** propose a *Tarifni broj* and amount for `AT` entries from the ingested tarifa; the lawyer confirms.
3. **Collection:**
   - payments against statements, paid/outstanding status, aging
   - reminders and *opomena*, *zatezna kamata* calculator
   - workspace issuer and bank settings (replace the print-view placeholders)
   - SEF e-invoicing
4. **Outlook connector:** after confirming mail hosting (Microsoft 365 via Graph preferred, IMAP fallback); proposes entries from client email.
5. **Lawyer-time AI:** contract drafting and review against firm playbooks (needs the office's contract-type list), client status-update drafts.

Still queued from the earlier roadmap: documents UI, client detail tabs, deadline calculator, conflict check, 2FA, Viber.
