# Financials architecture for the law office application

Status: implementation proposal based on the supplied Prisma schema and the clickable Financials prototype. This document defines the first implementation and the later AI integration boundary. It does not specify tax invoice compliance or a legally authoritative tariff calculation.

## 1. Purpose and boundaries

The Financials area answers five separate questions:

1. **What work might need review?** Completed events, tasks, deadlines and recorded activities are possible evidence of work.
2. **What work was actually performed?** A person records the service, date, performer, actual duration or quantity, description, client, optional case and any expense.
3. **What does the office charge for it?** A reviewer decides `BILLABLE`, `INCLUDED`, `NO_CHARGE` or `INTERNAL`, enters the proposed amount, and can refer to a particular version of a price source.
4. **What should the client see?** Selected and reviewed entries become lines on an informational service statement. Included/no-charge services may be shown at zero. Internal work and unresolved suggestions are never client-facing.
5. **What happened outside this app?** The office records the number of the formal invoice created in its other software and any payments received there. The app does not claim to issue a compliant tax/fiscal invoice or move money.

Call the client-facing document a **service statement** or **billing summary** in code and in the UI. The office may call it an invoice informally, but the document must clearly identify its role. Any legally required invoice fields, numbering, tax computation and transmission remain in the external invoice product until separately designed and verified.

The current schema contains no finance models. In particular, `Case` has no billing configuration, `CaseActivity` and `ClientActivity` have a date but no duration or price, `Task` has a due/completion date but no work duration, `Deadline` records a due/satisfaction target, and `Event.startsAt/endsAt` are scheduled times rather than verified time spent. `Event` associates clients through `EventClient[]`; it has no direct `clientId`. `ActivityLog` is history, not a timesheet. No existing row should silently become a charge.

## 2. Navigation and ownership

Use one **Financials** sidebar group with the following routes. Case and client detail pages link into filtered views rather than implement a second finance system.

| Page | Primary question | Main actions |
| --- | --- | --- |
| Overview | What needs attention, and what is recorded? | Review work, record work, prepare statement |
| Work review | Which source records might represent billable work? | Record actual work, dismiss suggestion, open source |
| Recorded work | What time, fees and expenses are eligible? | Add/edit entry, mark included/no charge, select for statement |
| Client statements | What was shown to each client? | Compose, edit draft, preview, finalize/share, link external invoice |
| Client balances | What remains unbilled or externally unpaid by client/case? | Open account, drill into entries and statements |
| Price sources | What did this client agree, and what public/state text is referenced? | Paste free-form text, save a new version, inspect source history |

In the prototype, Work review and Recorded work are tabs on one page. They can remain tabs in the Angular application. Client statement detail has an internal tracking view and a client-facing preview. Dialogs/drawers include candidate review, record time/fee/expense, entry detail/edit, statement composer, statement preview, external invoice/payment recording and price-source version history. Prefer reusing the application's existing dialog patterns.

## 3. Business rules

### Sources and review

| Existing source | Candidate trigger | What can be inferred | What must be supplied or confirmed |
| --- | --- | --- | --- |
| `Event` | Completed meeting, hearing or call | Title, case, clients through `EventClient`, organizer/assignees, scheduled start/end | Actual duration, participating worker(s), one billing client, service, decision, amount |
| `Task` | `DONE` | Title, case/client, assignee, completion time | Actual work and time; a task may lead to several entries |
| `Deadline` | `SATISFIED` | Filing/completion clue and related case/client | The performed service, if any; the deadline itself is not charged |
| `CaseActivity` / `ClientActivity` | Recorded activity | Type, title, date, linked case/client | Actual duration, work description, charge decision; a note/email may be non-billable |
| `Document`, `DraftResult`, `ActivityLog` | Later optional reminder | Work may have happened | Never infer a charge from upload, approval or log action alone |
| Manual entry | User records work or expense | User-supplied facts | Validate and review as usual |

Generate candidate rows only for workspace-accessible sources and define a stable source identity. If an event has multiple lawyers, one event can legitimately lead to separate entries for different performers. If an event has several linked clients, require explicit client selection. Case-linked candidates derive the client from `Case.clientId`; when both client and case are present they must agree. Dismissal must be remembered so the same source does not reappear on every refresh. Completing a task again or retrying a request must not create duplicate suggestions or billing entries.

Start with cheap, deterministic candidate generation: completed Events, completed Tasks, satisfied Deadlines, and optionally CaseActivity/ClientActivity. Query them over a bounded time range and persist a review decision keyed by workspace, source type/id and proposed performer (or a stable candidate key). Derive candidate display from source data. Use a real candidate table only if query complexity or change tracking requires materialization. A dismissed candidate may be reopened. Link multiple billing entries to one source when real work warrants it, but do not automatically duplicate the same source/person/service proposal.

### Recorded work

`BillingEntry` is the canonical account of performed work. It is not a task, deadline, event or ActivityLog. A client is required; case is optional for consultation and general advisory. Suggested types: `TIME`, `FIXED_FEE`, `EXPENSE`. Store `performedByUserId`, `workDate` (date-only), description, actual `durationMinutes` where relevant, optional quantity/unit, currency and **manually confirmed** amount. For an expense, support vendor/receipt/document reference later; expense reimbursement is distinct from attorney fees.

Maintain two independent concepts:

- **Disposition:** `BILLABLE`, `INCLUDED`, `NO_CHARGE`, `INTERNAL`. Included/no-charge entries have zero client charge and a reason. `INTERNAL` entries cannot be included on a client statement. A billable entry requires a positive amount.
- **Lifecycle:** `DRAFT`, `READY`, `RESERVED`, `STATEMENT_SENT`, `VOIDED`. Draft/ready entries remain editable under permissions. Reserved entries belong to a draft statement. Once sent, the client-facing snapshot must remain stable; use an explicit adjustment/reversal workflow instead of mutating history.

Do not mix work performed, estimated value, amount billed and amount paid. A future timer is a convenience for producing draft actual duration, not proof that the entire scheduled event was worked. If time increments/rates are introduced, store actual duration, billed duration, the increment/rate used, and the final amount as snapshots. The initial version can ask the user for an amount directly rather than pretending to parse free-form prices.

### Price sources

The primary UI for client prices is **one large free-form text area**, with paste support. The office can write plain-language service prices, exceptions, case-specific terms and notes; do not force every entry into a structured service catalog. A second free-form source stores public/state/tariff reference text. Store these as versioned text records, not mutable fields on `Client` or `Workspace`.

Each `PriceSourceVersion` should capture scope (`CLIENT_AGREEMENT`, `WORKSPACE_PUBLIC_REFERENCE`, and optionally `CASE_OVERRIDE`), workspace, optional client/case, title, full text, source URL or uploaded document ID, publication/effective dates when known, version number, author, creation date and supersession state. Keep prior versions readable. Do not interpret a tariff, choose its legal applicability, or overwrite old statement amounts on a later text edit. A manually selected entry may reference a specific version and quoted passage; the entry still snapshots its final price.

Price-source precedence **for later proposals** is a case-specific written agreement, then a client agreement, then an applicable workspace public/state reference, then no price recommendation. This is retrieval priority, not a legal rule or automatic rate computation. Multiple or contradictory passages produce an ambiguity requiring review.

### Statements and external tracking

A `BillingStatement` is scoped to one client and workspace; it has a period, internal number, issue/share dates, currency and status `DRAFT`, `SENT`, `VOIDED`. Its `BillingStatementLine` rows snapshot the exact client-facing description, service date/period, case reference when appropriate, quantity/duration if shown, amount, currency, and charge label. A line may link to one `BillingEntry`; manual statement-only lines must first create a corresponding reviewed BillingEntry or be stored as explicitly manual, audited lines. Choose one policy and keep a traceable origin. For MVP, require a BillingEntry for every line, including manually added work; a standalone manual line may be created in the composer only by creating its entry in the same transaction.

The statement can show `BILLABLE` lines with amounts and explicitly selected `INCLUDED`/`NO_CHARGE` lines at zero. It must never expose `INTERNAL` work, unresolved suggestions, price-source raw text, private notes or confidential supporting documents. The preview should match the exported/printed document. DRAFT remains editable; on `SENT`, freeze the line and amount snapshots and mark linked entries sent. Share/send is an explicit user action; if the application has no delivery integration, record that the user shared/exported it externally and do not imply an email was sent.

Store an optional formal external invoice number/date/URL or attachment as **external reference** on the statement or in a one-to-one linked record. Store payments as separate `ExternalPaymentRecord` rows (amount, currency, paid date, reference, recorder, optional correction/reversal), not as a manually editable payment-status enum. `paid = sum(non-reversed payments)`, `outstanding = max(0, charged total - paid)`, and `UNPAID`/`PARTIAL`/`PAID` are derived. In MVP, manual external invoice/payment tracking may be limited to these records; it is not a general ledger. Do not count draft statements as receivables. Void or correct sent statements explicitly while preserving history; never silently recycle a sent statement number.

### Summary calculations

- **Work to review:** unresolved candidate count, not money.
- **Unbilled work:** sum of `READY + BILLABLE` entries that are not reserved on a draft or already sent; show reserved draft amounts separately if needed.
- **No-charge/included:** tracked effort and zero client charge, never revenue.
- **Sent statements:** sum of frozen billable line amounts; a statement with zero-charge lines can still total zero.
- **Externally unpaid:** sum of outstanding on sent, non-void statements with manual external tracking. If there is no corresponding external invoice, label the value “unmatched sent statements” rather than a legally recognized receivable.
- Aggregate by workspace, client, case and performer; never sum unlike currencies without conversion.

## 4. Data model proposal

The exact Prisma syntax should follow the repository's migration conventions. Suggested entities and fields:

| Entity | Essential data | Constraints / relationships |
| --- | --- | --- |
| `BillingEntry` | workspace, client, optional case, performer, sourceType/sourceId, kind, disposition, lifecycle, date, description, actual/billed minutes, quantity, unit/rate, amount `Decimal`, currency, reason, price source version, creator/updater, timestamps | Validate client/case/workspace and performer membership; index workspace + client/case/date/status; linked entry may appear on at most one active statement |
| `BillingSuggestionReview` | workspace, sourceType/sourceId, proposed performer, resolution `PENDING/RECORDED/DISMISSED`, actor, date, optional entry link | Stable unique candidate identity; supports reopening and idempotent completion hooks |
| `PriceSource` and `PriceSourceVersion` | scope, workspace, optional client/case, title, versioned raw text, source metadata, effective dates, author | One current version pointer or active flag; append version instead of overwrite; old version referenced by old entries |
| `BillingStatement` | workspace, client, internal number, period, currency, status, shared method/date, external invoice reference, timestamps | Unique number per workspace, sent snapshot immutable, client remains consistent |
| `BillingStatementLine` | statement, entry, order, client-facing service snapshot, amount `Decimal`, currency, charge label, case snapshot | All lines belong to statement's client; prevent entry appearing on two active statements; zero amount for included/no charge |
| `ExternalPaymentRecord` | workspace, statement, paid amount `Decimal`, currency, paid date, external reference, actor, optional reversal | Positive amounts; no cross-client/workspace link; sums cannot exceed statement total without explicit overpayment policy |

Use Prisma `Decimal` with an explicit precision/scale for money, never JavaScript floating-point arithmetic for persisted totals. Store currency as an ISO code even if the initial UI defaults to `RSD`. Add reverse relations on `Workspace`, `Client`, `Case` and `User` as appropriate. Avoid cascade deletes that could erase sent financial history; existing `Client` and `Case` are archived rather than physically deleted in ordinary use. Use database transactions and a row lock or equivalent protection for concurrent statement composition/finalization and payment recording.

## 5. API and service boundaries

Keep financial logic in one NestJS feature module, calling existing domain/read services rather than introducing write dependencies into every Case/Task/Event service. Initial endpoints, adjusted to repository naming/contracts:

| Endpoint | Purpose |
| --- | --- |
| `GET /api/financials/overview` | Scoped counts and totals with currency and date filters |
| `GET /api/financials/candidates` | Cursor/paginated, filtered candidate inbox with source display refs |
| `POST /api/financials/candidates/:key/dismiss` / `.../reopen` | Persist review decision idempotently |
| `GET/POST /api/financials/entries` | List and manually record time, fee, expense |
| `GET/PATCH /api/financials/entries/:id` | Detail/edit allowed states; validate transitions |
| `GET/POST /api/financials/price-sources` and `GET/POST /:id/versions` | List, inspect and append raw-text versions |
| `GET/POST /api/financials/statements`, `GET/PATCH /:id` | List, compose and edit draft |
| `POST /api/financials/statements/:id/send` / `.../void` | Explicit state transitions with audited actor |
| `POST /api/financials/statements/:id/payments` | Record a verified external payment |
| `GET /api/financials/clients/:clientId/account` | Client case, entry and statement summary |

Expose shallow display references for client/case/user as the other app APIs do; keep request payloads and filters ID-based. Use the authenticated workspace context, existing CSRF/origin protection, validation and shared API contracts/clients. Add explicit finance permissions: a lawyer can record and see permitted own work; a finance manager (at first OWNER/ADMIN unless existing permissions provide a better fit) can edit office price sources, view all amounts, finalize statements, and record external payments. `MEMBER` must not receive all-client finances merely from workspace membership. Respect any existing case visibility rules. Validate scope server-side even when the frontend filters choices.

Create financial audit events for amount changes, price-source versions, candidate decisions, statements, external references and payments. Avoid writing full sensitive pasted price text or document bodies into the audit log. Use idempotency for mutation retries that can create statements/payments, plus unique constraints and transactional checks. Do not let a background event completion service create a charge. Prefer a Finance candidate builder on read, or a narrow domain event subscribed by Finance, with deduplication.

## 6. Future AI agent: exact responsibility and workflow

The AI agent is a **proposal maker within Financials**, not a bookkeeper and not the source of truth. Its job is to help the user answer, “Which reviewed work should be on this client's next statement, how should each service be described, and what amount is supported by which price text?” This is separate from the general-purpose chat agent: it is a domain workflow/tool invoked from statement composition or a natural-language request, using the same authentication, workspace scope and review interface.

### Inputs the agent may use

- The user's request, e.g. “Prepare the September summary for ACME, include hearings, but don't bill internal calls.”
- Client, optional case(s), date range, current statement draft, reviewed BillingEntries, unresolved candidates when specifically asked to find missing work.
- The **versioned** client/case price text and any applicable public/state source text with source metadata; only authorized, current or historically relevant versions.
- Source records needed to explain entries: event, task, deadline, activity, linked documents only when authorized and necessary. Do not bulk-send every workspace document.
- Relevant finance rules (zero-charge label, currency, eligible states, number of currencies, approval requirements).

### Agent stages

1. **Parse intent.** Identify client, period, optional cases and inclusion/exclusion instructions. Ask one focused question when client, period, a conflicting instruction or a multi-client source is ambiguous.
2. **Retrieve facts deterministically.** Call bounded finance read tools; load candidate entries by IDs, price-source versions and source metadata. Treat pasted agreements and documents as untrusted data, not instructions to the agent.
3. **Propose selection.** Choose eligible reviewed entries; distinguish excluded, already reserved/sent, included/no-charge and missing-work suggestions. Never invent work or treat a Deadline as a billed service.
4. **Propose client-facing language.** Produce concise descriptions grounded in confirmed work; omit internal notes, privileged detail and sensitive document content unless explicitly approved.
5. **Propose prices.** Quote exact price-source version, passage and calculation when supported. Prefer explicit case agreement, then client agreement, then relevant state/public text as a possible reference. If applicability, quantity, rate, currency or effective date is uncertain, return `NEEDS_REVIEW` and explain what is missing; do not guess a number. Snapshot the reviewed amount rather than re-evaluating later from new text.
6. **Validate with deterministic code.** Enforce workspace/client relationships, eligible entry states, no duplicate line, nonnegative Decimal amount, total, currency, source availability and proper permission. The model's own assertion is not validation.
7. **Present a reviewable proposal.** Show selected/excluded entries, editable description and amount, included/no-charge lines, price citation and flags. The user changes anything and explicitly confirms the draft. Only application services write financial state.
8. **Follow-ups.** “Remove the call,” “use the agreed fee,” or “show that filing as included” operate on the current proposal/draft with a new revision; retain previous proposal and the user's overrides. Once sent, start an adjustment workflow rather than rewriting the sent statement.

Suggested structured response: `{ clientId, period, selectedEntryIds, excludedEntryIdsAndReasons, lines: [{entryId, disposition, proposedDescription, proposedAmount, currency, priceSourceVersionId, excerpt, calculation, confidence, questions}], warnings, proposalRevision }`. Confidence is a UI aid, never an authorization to send automatically. Give every generated line an evidence link to both the performed work and the price passage or mark it as manual/unsupported. Prevent prompt injection from copied client agreements and retrieved documents. Log model/tool invocation metadata and decisions without persisting unnecessary sensitive prompts or raw documents in logs. Never allow the agent to finalize/share a statement, create a formal external invoice, or mark a payment received on its own.

### What the first implementation must prepare now

Persist original free-form price text with versions and attribution; stable IDs for BillingEntries and their source records; immutable line snapshots; explicit reviewed decisions; a typed “proposal” contract or TODO seam. **Do not call a model, parse price text automatically, or hard-code supposed AI results in the backend.** The human selects entries, edits descriptions and enters prices through the same data structures the AI will eventually propose.

## 7. End-to-end examples and edge cases

**Hearing:** A completed `Event` has scheduled 10:00–11:15. Work review shows the clue. Ana confirms actual hearing service and either actual time or a fixed agreed fee; selects the billing client if multiple clients were linked. A BillingEntry is created with the event source. Later a statement line snapshots the approved description and amount. The scheduled 75 minutes alone never creates a charge.

**Task and deadline:** “Prepare response” is completed and the filing deadline is satisfied. The user records two distinct services only if actual work warrants it; the same work is not counted twice because both records exist. The deadline can link as context.

**Client included service:** An internal call was included under a client agreement. The user records its work at zero with `INCLUDED` and may choose to show it on the statement as “Included in agreed fee.” An `INTERNAL` staff meeting stays hidden.

**Mixed clients and cases:** Each statement is for exactly one client. Entries from another client must be rejected by backend validation, including when an entry's case belongs to another client. A case is optional on entries, but required case filters must not exclude general advisory by accident.

**Concurrent use:** Two users select the same entry for drafts. The server reserves it once; the second request receives a conflict and reloads. A cancelled/voided draft releases eligible entries under a transaction. A sent statement never releases an entry merely because the UI closes.

## 8. Delivery order and acceptance

1. **Backend foundations:** migrations, scoped contracts and permissions, entries, deterministic review candidate/decision, price-source versioning.
2. **Statement core:** draft composer, reserved entries, immutable send transition, preview/print representation, external invoice references and payment records.
3. **Frontend:** pages and dialogs from the prototype, filters, validation, totals, loading/empty/error states, localization and responsive layout.
4. **Later AI:** only after reviewed entries, price versions, statement line snapshots, auth and auditing work end to end.

Acceptance cases: same completed event is not repeatedly suggested after dismissal; multi-worker and multi-client events require deliberate choices; Case/Client mismatches and cross-workspace IDs fail; one entry cannot be placed on two active statements; draft edits work and sent snapshots stay unchanged; included/no-charge shows zero only when selected; totals use Decimal; partial external payment changes derived outstanding; price-source edits create new versions while prior statements keep their old amount and citation; finance access is enforced on API endpoints. The frontend must never treat a source record or AI proposal as an approved charge.
