# Business Logic Done So Far

**Checked:** 2026-10-07
**Scope:** `apps/api`, `apps/web`, shared API contracts and API clients.

This document describes behavior that is currently implemented in code and wired into the application. It does not treat a route, translation key, or empty component as a finished workflow.

## Backend foundation

- The API is an Nx/NestJS application composed from feature modules for authentication, chat, clients, cases, references, user settings, activities/tasks/deadlines, legal knowledge, and workspace documents.
- Prisma is used for persistence through the shared platform database service.
- Workspace-aware endpoints use authentication, CSRF/origin protection, and workspace membership checks. Domain services validate that referenced cases, clients, client contacts, deadlines, and active workspace users belong to the current workspace.
- API responses use shared contracts from `libs/api/api-interfaces` and paginated response metadata where list endpoints support pagination.
- User-facing API responses expose depth-1 display references for related clients, cases, and users where the web UI shows those relationships. Request payloads, filters, route params, and internal identifiers still use IDs.
- Domain mutations create activity-log entries for the activities/tasks/deadlines workflow and for document create/update/version/archive/restore, preserving the acting user and workspace context.

## Legal knowledge retrieval

- PostgreSQL `pgvector` is the sole vector-store direction; the former unused vector-store/template stubs are removed.
- Versioned public legal sources and workspace-scoped sources are persisted with content hashes, parser metadata, Serbian source-script metadata, and article/paragraph chunk metadata.
- The Paragraf Lex source adapter fetches and validates law pages. `PARAGRAF_CORE_SOURCES` in `@law/knowledge` lists 33 core laws grouped by practice area for the target office (procedure, contracts, company, competition, IP, media, data protection, human rights, real estate, agriculture, family, arbitration, labor), plus the Advokatska tarifa (_Tarifa o nagradama i naknadama troškova za rad advokata_). Chunks split on articles (`Član N`) and on tariff items (`Tarifni broj N`). A tariff item is stored and cited as "Tarifni broj N", not as the last article before it. `npm run legal:ingest` ingests `Zakon o radu` by default, one page with `--url/--slug`, or the manifest with `--all` / `--area=<area>`. `--dry-run` reports the normalized chunk set without embedding or database writes. Real ingestion uses BGE-M3 (1024 dimensions) through the server-side OpenRouter embeddings endpoint. Batch runs isolate per-source failures and skip unchanged sources by content hash.
- `npm run legal:export` writes the public embedded corpus (sources, `INDEXED` versions, chunks with vectors) to a gzipped NDJSON snapshot. `npm run legal:import -- <file>` loads it without calling the embedding provider. Import refuses a mismatched embedding model, mismatched dimensions or a missing migration. It skips versions that already exist (same slug and content hash) and never deletes rows.
- `POST /api/legal-knowledge/search` performs authenticated, workspace-filtered cosine search and returns source/article citation metadata with each result.
- The `drafting` workflow retrieves matching indexed legal-source chunks per `BriefResult` field (legal basis entries, factual description, claim summary), above a minimum similarity threshold, and instructs the drafting LLM to cite them inline with `[n]` markers; only markers the model actually used are persisted as `DraftCitation` rows (article, source, snippet, score) and returned on `DraftResultResponse.citations`.
- The `answering` workflow performs the same single-query retrieval against the user's message and persists any `[n]` markers actually referenced as denormalized citations on `ChatMessage.metadata`, returned as `ChatMessageResponse.citations`.
- The assistant frontend renders `[n]` markers in assistant chat replies as jump links and shows a compact "Izvori" (Sources) list under grounded messages. A marker scrolls the chat panel to that same message's source entry (anchor ids are unique per message), focuses and briefly highlights it, and never changes the URL. Hovering or keyboard-focusing a marker opens a preview anchored to it with the cited article, source title, snippet, match and source link (`role="tooltip"`, closes on leave, blur, Escape, scroll or click); streamed updates only re-pin the transcript to the bottom when the reader was already there; the draft review panel shows the same citations in a collapsible "Izvori" section (article/source/snippet/match/source link).
- Hybrid search, reranking, and citation-accuracy verification against case law remain follow-up work.

## Authentication and account security

Implemented in `libs/api/features/auth` and used by the web application:

- Login with an HTTP-only session cookie.
- Current-session lookup (`/auth/me`), session refresh, and logout.
- Invitation acceptance and authenticated invitation creation.
- Forgot-password, reset-password, and authenticated password-change flows.
- Rate limiting on login and password-forgot requests.
- Authenticated route protection in the Angular router through `authGuard`.

## Clients

The clients backend and frontend are connected and provide a usable client-management workflow:

- Paginated client listing with search.
- Create, read, update, archive, and activate client records.
- Individual and organization client data support.
- Client addresses: list, create, update, and delete.
- Client identification documents: list, create, update, and delete.
- Client contacts: list, read, create, update, and deactivate.
- Client-related cases and client activity listing/creation/update.
- Client detail loading combines the client, addresses, contacts, identification documents, and workspace-user references.
- The frontend has a client list, create/edit dialog, client detail page, tab navigation, loading/error states, search, pagination, and links to related cases.

## Cases

The cases backend and frontend implement the main case lifecycle:

- Paginated case listing and case search/filter support through the API client.
- Case number suggestions and configurable case-number formatting.
- Case creation, detail loading, and editing.
- Case status transitions: activate, put on hold, resume, close, reopen, and archive.
- Case close data includes a closed date and optional closing note.
- Case activities: paginated list, create, and update. The list supports case-insensitive title/description search and multiple activity-type filters applied before pagination.
- Case responsibilities: paginated list, add, update, end, and set a primary responsible user.
- Case/client relationship validation is enforced in the backend.
- Case list/detail responses include shallow client and responsible-user display objects, so the frontend shows names instead of relation IDs while edit/create payloads remain ID-based.
- The frontend includes case list, case creation/edit form, case detail, lifecycle controls, activities, responsibilities, confirmation dialogs, and save/error feedback. Case-detail activities expose keyword and searchable multi-type filters; activities, documents, responsibilities, assistant sessions, and assistant drafts have server-backed pagination. The routed create/edit form includes a breadcrumb back to its originating return URL or the Cases list.

## Workspace documents (backend)

Authenticated document APIs and the Angular Documents workspace are implemented, including list/grid, metadata details, download, archive/restore, version history and version uploads.

- `POST /api/documents` uploads one streamed file (`multipart` field `file`) with title and optional `caseIds`/`clientIds` and `folderId`. The folder must belong to the active workspace. `Idempotency-Key` is required and its fingerprint includes the destination for folder uploads.
- Paginated list (`archived` defaults to active-only; `true`/`false`/`all`), detail, metadata/link patch (arrays replace when present), version upload/list, current and historical download, archive, and restore.
- Bytes live under `FILE_STORAGE_ROOT` with generated keys. Metadata and the recorded storage connection stay in PostgreSQL. Chat uploads are not moved.
- Linked cases and clients must belong to the workspace (400 when unavailable). Archive hides from the default list; authorized detail and download still work.
- Document list/detail responses include shallow linked case and client display objects for each document link.
- There is no virus-scanning claim, no cloud adapter, and no permanent delete in this slice.
- Each document version can carry extracted Serbian Latin text (`extractionStatus`, `extractedText`, `sourceScript`). The assistant fills it lazily; it is not exposed in the document API.

### Persistent document folders

- `DocumentFolder` stores workspace-owned parent/child hierarchy separately from physical file storage. Documents have an optional folder; root files have no folder. Composite foreign keys prevent cross-workspace relations. Sibling names, including root names, are unique.
- `GET /api/documents/folders` returns direct children and ancestor breadcrumbs. `POST /api/documents/folders/ensure` atomically resolves a bounded batch of relative paths below an optional target folder, reusing existing siblings under concurrent imports. It rejects traversal, empty/control-character segments and excessive paths; names are stored in Serbian Latin.
- Folder browsing accepts `archived=true|false`. `PATCH /api/documents/folders/:id` renames or reparents a workspace folder; sibling-name conflicts and self/descendant destinations are rejected under a workspace lock. `PATCH /api/documents/:id` accepts `folderId` (including null for root), validating active workspace destinations.
- Folder archive/restore endpoints recursively update logical folders and their files. Restore only restores records stamped by that folder archive, retaining independently archived records; an archived parent must be restored first. Uploads recheck destination availability under the same workspace lock before persistence.
- `GET /api/documents/folders/:id/download` streams a ZIP containing nested paths, empty folders and current file versions. Entry names are sanitized and disambiguated; downloads are capped at 1,000 folders, 250 files and 1 GiB of source data. Physical storage and original version filenames are unchanged by display-name renaming.
- The documents list/grid share page-local selection: plain click selects, Ctrl/Meta toggles, Shift selects ranges, and checkboxes/select-all provide an accessible alternative. Double-click or Enter opens folders/file details; Space toggles selection. The final actions column is removed. A selection toolbar displays separate file/folder counts before translated, tooltip-equipped move/download/archive/restore/clear controls. Failed bulk mutations remain selected for retry.
- Inline file/folder display-name rename supports Enter/save, Escape/cancel, pending guards and retained input on error. Move uses a lazy, nested folders-only picker with root selection and selected-subtree exclusions. Archive reuses the existing confirmation dialog. Association controls do not select/open rows, and file detail fits mobile viewports.
- `GET /api/documents?folderId=root|<id>` scopes files before pagination. Omitting the location preserves global lists for case/client views and other consumers. Recent and Needs linking filters run before pagination. `GET /api/documents/statistics` returns real workspace-wide document counts, excluding folders.
- The Documents page navigates direct children with breadcrumbs and displays folders before paginated files in both list and grid. Uploads target the current folder. The fixed-layout list has type icon, name, category, linked records, version, size, import date (immutable `createdAt`) and actions. Long names/linked values truncate with full tooltips.
- Folder picker and supported directory drops normalize files into the existing upload queue. The backend resolves hierarchy before uploads start; resolved destinations are frozen with retry payloads. Folder preparation also protects against closing. Empty directories not exposed by the picker are omitted; unsupported directory drops guide users to Select folder. Version mode remains single-file only.

## Workspace documents (upload modal)

- Documents, client detail, and case detail can open a reusable upload dialog against `POST /api/documents`.
- Each selected file is its own document. Title is required (max 320). Case/client links are locked on those detail pages and searchable on the documents page.
- Upload uses XHR progress (`withXhr()`), concurrency 2, and a frozen `Idempotency-Key` on retry. Optional per-row category codes are stored on `Document.category`. Clients are selected before cases; case search is constrained by selected clients. The document detail panel opens the same queue in single-file version mode.
- Removing a row only drops it from the local queue. It does not archive or delete a stored document.
- The upload dialog does not dismiss on an outside/backdrop click; users close it through its explicit actions.

## Calendar, events, tasks, and deadlines API

The backend implementation in `libs/api/features/activities-tasks-deadlines` is substantially complete as a domain API:

### Events

- List, create, read, and update events.
- Event filtering by type, status (single or multiple), case, client, and user (single or multiple, matching organizer or assignee).
- Event completion and cancellation transitions.
- Event validation ensures the end time is after the start time.
- Events can reference cases, clients, workspace assignees, and client contacts as attendees.
- The event dialog exposes responsible-user, optional-client, and optional-case selectors; selecting a case selects its client, choosing an incompatible client clears the case, and new events default responsibility to the signed-in user.
- Event creation/update trims user-entered text and records activity-log entries.

### Tasks

- List, create, read, and update tasks.
- Filtering by status (single or multiple), priority, assignee (single or multiple), case, client, deadline, free-text search (title/description), and a due-date range.
- Tasks support either a due date or a due timestamp, never both.
- Newly created tasks default to no due target; a due date or exact due timestamp is only added when the user explicitly selects it. Edit mode preserves the stored due target.
- Task completion, cancellation, and reopening transitions.
- Tasks can be associated with cases, clients, and deadlines.
- The task dialog exposes responsible-user, optional-client, and optional-case selectors; new tasks default responsibility to the signed-in user. Selecting a case selects its client, while selecting an incompatible client clears the case.

### Deadlines

- List, create, read, and update deadlines.
- Filtering by status (single or multiple), type, responsible user (single or multiple), case, client, free-text search (title/description), and a due-date range.
- Deadline validation requires exactly one due target: due date or due timestamp.
- Deadline satisfaction, cancellation, and reopening transitions.
- API responses calculate whether an open deadline is overdue.
- Deadlines support responsible users, case/client associations, time zones, and source descriptions.
- The deadline dialog exposes responsible-user, optional-client, and optional-case selectors; new deadlines default responsibility to the signed-in user. Selecting a case selects its client, while selecting an incompatible client clears the case.

### Calendar aggregation

- Calendar aggregation returns events, tasks, and deadlines for a date range with filters for user (single or multiple), client, case, source type (single or multiple), status (single or multiple), a flag to include tasks/deadlines with no due date, cursor, and limit.
- Calendar items include the full assignee list for events (not just the organizer), so multi-assignee events can be attributed correctly.
- Event, task, deadline, and calendar responses include shallow case/client/user display objects where those relationships are shown in the frontend.
- Activity-log listing is available with case and client filters. It never returns work-entry rows (`entityType` `WORK_ENTRY`, which carry minutes, treatment and write-off reasons); those stay on the time screens, so the dashboard feed, the case/client feeds and the assistant's activity tool do not show them.
- Free-text search and multi-value person/status filters were previously accepted by these endpoints but silently ignored; they are now actually applied server-side.

## Calendar frontend

The calendar is the finished frontend surface for the event/calendar portion of the work-management API:

- Month, week, and agenda views, plus List and Board presentations (see the shared work view below) selectable alongside them without disturbing the grid views' rendering or date math.
- Date navigation and “today” navigation.
- Visible-range loading requests events, tasks, and deadlines. In week view, tasks and deadlines are grouped under their due day in the sticky obligations header; a `dueDate` is date-only and a `dueAt` contributes its Belgrade-local completion time.
- Search and source filtering for events, tasks, and deadlines.
- Lawyer/user filtering through workspace references.
- Calendar loading, error, and incomplete-range states.
- Multi-day event segmentation and overlap layout in the week view.
- The week view uses non-interactive date headers plus a sticky tasks/deadlines row while the hourly event grid scrolls. Obligation entries are one-line, truncated, red-marked, and selectable; selection opens the existing details popover rather than duplicating it in a tooltip.
- Event detail popovers/menu actions and event create/edit dialog. The global header exposes localized create-task and create-event quick actions beside create work; they reuse the existing dialogs, and new events open for the current local date at 09:00.
- Separate Calendar actions create obligations/events or open the reusable deadline dialog with the selected date prefilled; successful deadline creation refreshes the visible range. Editing a Calendar deadline loads its full detail, opens the same deadline dialog in edit mode, and refreshes the range after save.
- Event form validation, including end-after-start validation, and API-backed create/update operations.
- Client, case, and workspace-user relation fields in task/deadline/event dialogs use searchable, content-width comboboxes. Responsible-person fields and cases remain single-value on every form; events support multiple clients and send the selected responsible person through the existing assignee API contract. Calendar user filtering is searchable and accepts multiple workspace users.
- Calendar state is represented with Angular signals and uses the shared API clients.

## Team work, My work, and the shared work view

The former Tasks & Deadlines page has been replaced by a single reusable `WorkView` component (List and Board presentations) reused across four contexts — Team work, My work, Calendar, and Case → Work:

- Routes: `/work/team` (Team work, full filter toolbar) and `/work/my` (My work, current-user work only, no team filter toolbar). The former `/tasks-deadlines` URL redirects to Team work, preserving query parameters. Sidebar navigation exposes both as separate entries.
- Record types (Tasks, Events, Deadlines) are combined into one unified item list/board; the record-type filter selects one or several.
- List view shows title, record type, status, owner/assignee, due date or event time, related case/client, and an overdue indicator.
- Board view groups items into To do / In progress / Done columns using a presentation-only mapping (Task `IN_PROGRESS` is the only source of the In-progress column, since Events and Deadlines have no in-progress state); Cancelled items are only shown through an explicit open/history switch, never mixed into the active columns.
- Filters: free-text search, record types, people (single or multiple, via a searchable multi-select combobox), statuses (single or multiple), case, and a date preset (all dates / overdue / today / upcoming). My work hides the person filter and keeps the current user fixed; Case → Work keeps the case fixed. Neither fixed constraint can be cleared by switching presentation, changing filters, or resetting. The task-list API currently accepts one `caseId`, so the case filter remains single-value.
- Pagination is server-driven per record type with an explicit “Load more” action; no page of results is presented as a complete list or board.
- Item actions reuse the existing Task/Deadline/Event dialogs and transition endpoints (create, edit, complete/cancel/reopen for tasks and deadlines; complete/cancel for events, which have no reopen). Board also supports drag-and-drop between columns, restricted to the same backend-supported transitions as the action buttons — a drop with no corresponding transition (for example, dragging a cancelled item, or dragging an event back out of Completed/Cancelled) is rejected rather than silently allowed. Task cards show their priority with semantic low/normal/high/urgent badges.
- "My work" is defined per entity by existing domain relationships (task assignee, deadline responsible user, event organizer-or-assignee), not by who created the record.

## Cases: Work tab

The case detail page has an additional Work tab alongside Overview, Activities, Documents, Assistant, and Responsibilities, rendering the same shared `WorkView` component with the case fixed. Creating a task, deadline, or event from this tab prefills the case.

## Dashboard

The dashboard is a real, API-backed landing page (previously an empty placeholder), composed from a dashboard-scoped facade (`DashboardStore`) and reusable presentation components rather than one large component:

- A greeting (authenticated user's name with a safe fallback) and an assistant prompt box that hands the entered text to the existing assistant page once, via a one-time query parameter the assistant consumes and immediately strips from the URL — no second chat implementation and no auto-sent/duplicated messages.
- Four summary cards (active cases workspace-wide, upcoming hearings for the current user in the next 7 days, pending tasks assigned to the current user including tasks without due dates, and total documents workspace-wide including archived records). Counts use bounded queries (`pageSize: 1` reads against each existing list endpoint's authoritative `meta.totalItems`), never the length of a fetched page.
- An Upcoming obligations panel built on the existing calendar aggregation endpoint (deduplicated, unfinished Task/Deadline/Event items for the current user in the next 7 days), with a separate overdue count/link into My work so overdue items remain visible outside the 7-day window, and item selection opens the existing Task/Deadline/Event dialogs.
- A Recent activity panel built on the existing ActivityLog endpoint, reusing the same action-label mapping as the Team/My work views.
- The Notifications panel reuses the root notification store shared with the header, shows the four latest notifications with unread state, context, relative time, loading/error/empty handling, marks selected items read, and navigates to My work or Calendar. Its settings action still opens workspace notification preferences.

## In-app notifications

- Notifications are persisted in PostgreSQL and always belong to both the hardcoded workspace and one user. List, unread-count, mark-one-read, and mark-all-read operations are scoped by `WorkspaceContextService.required` (`workspaceId` plus authenticated `userId`); marking one row never updates by id alone.
- Supported types are task assignment/due-soon/due-today/overdue, deadline assignment/due-soon (7/3/1 days)/due-today/overdue/changed, and event upcoming/changed/cancelled. Event recipients are the organizer plus internal `EventAssignee` users, deduplicated; external `EventAttendee` rows are never recipients.
- `UserSettings.workspaceNotifications` is the user master switch and `WorkspaceConfig.workspaceNotifications` is the workspace creation switch. Per-type preferences are validated JSON on `UserSettings`; missing rows, JSON, or keys default to enabled. Disabling a preference affects only future notifications.
- Immediate assignment/change/cancellation notifications are written through the centralized notification service in the same Prisma transaction as the domain mutation. Self-assignment and notifications about the actor's own event/deadline change are skipped.
- An hourly in-process reminder runner scans only current open task/deadline/event states. `dueAt` wins over date-only `dueDate`; date comparisons use the deadline/event timezone or user/workspace/Belgrade fallback. Reminder dedupe keys include the target schedule, so concurrent/repeated runs are database-idempotent while a rescheduled record can generate reminders for its new occurrence. Existing overdue open records intentionally receive at most one current overdue notification after rollout.
- The Angular header uses the existing bell and Spartan dropdown: workspace-specific unread badge, ten-row initial page, scrollable list, Show more append, loading/error/empty states, mark one/all as read, accessible unread text, relative times, and navigation into My work or Calendar. The existing workspace settings form contains the master switch and all per-type notification switches in localized Serbian/English UI.
- A Cases overview preview (5 most recently updated accessible cases) and Quick actions that reuse the existing case creation route and the existing Task/Deadline/Event/Client dialogs; affected dashboard sections refresh independently after a successful quick action.
- Each section (stats, upcoming, activity, cases) has its own loading/error/empty state, so one failing request does not blank the rest of the dashboard.

## Assistant, chat, and drafting

The assistant workflow is implemented across the chat API, Angular assistant screen, and shared contracts:

- Create, list, rename, load, and soft-delete chat sessions.
- Conversation organizer in the assistant sidebar (`law-conversation-navigator`):
  - Token search: typing suggests clients, cases, authors and analysis types (`GET /chat/sessions/facets`); picking one adds a removable chip. Leftover text searches title, case number, case name, client name and message text (Cyrillic input is matched in Latin).
  - Filter chips: `Moji`/`Tim` scope (default `Moji`, i.e. conversations the user started), `Čeka odobrenje` (pending proposal or queued/running job), `Nacrti`, `Analize`, `Arhiva`. Chip counts come from the facets endpoint.
  - Group by `Datum` (today/yesterday/date) or `Predmet` (client · case number, unlinked last); pinned conversations are always on top.
  - Row menu: pin/unpin (`ChatSession.pinnedAt`), archive/restore (`ChatSessionStatus.ARCHIVED`, hidden from the default list), rename, delete. `PATCH /chat/sessions/:id` accepts `title`, `pinned`, `archived`.
  - Filters live in URL query params (`scope`, `state`, `archived`, `q`, `group`, `client`, `case`, `author`, `kind`); the group mode is also remembered per browser. Filtering never switches the open conversation.
  - `GET /chat/sessions` accepts `scope`, `states`, `archived`, `caseIds`, `clientIds`, `authorIds`, `analysisKinds`, `group`; summaries carry `pinnedAt`, `createdBy`, `activity.pendingActionCount` and `activity.analysisKinds`. Without `scope` the API lists the whole workspace, as before.
- Send chat messages with up to five uploaded files.
- Attachment download support and server-side workspace scoping.
- Session event replay and live Server-Sent Events streams, including workspace-level events.
- Message feedback and answer regeneration.
- Job retry support.
- Draft listing and draft retrieval by script (`latin`/`cyrillic`).
- Draft text editing, review notes, approval, rejection, and DOCX export endpoints.
- The assistant frontend supports session navigation/search, message rendering, file upload state, live workflow activity updates, retry/resync behavior, feedback, regeneration, draft review, localization, and speech input.
- Assistant workflow state, markdown rendering, and the main assistant component have focused frontend tests.
- A chat session can be created or later linked to an existing workspace case. New drafts copy that case id. Approved drafts stay on their original case if the session is relinked.
- After brief extraction, the Case-work pane opens in the right rail (shared with the Draft review panel via a compact Draft / Case-work tab switcher shown only when both exist), without narrowing the chat column. A fresh brief auto-expands the rail on the Case-work tab and a fresh draft opens the Draft tab; refresh/SSE updates never re-expand a rail the user collapsed, switching sessions collapses it, and deleting the active session resets the brief/rail state. Nothing remains in the message stream. The lawyer confirms a client and case separately from tasks. The pane shows the document type and its parties by role. The type's default client party (tužilac for a tužba, tuženi for an odgovor na tužbu, žalilac for a žalba, izvršni poverilac for a predlog za izvršenje) becomes the client (existing match or a new individual), and the lawyer can switch to another party, which reloads the suggestions. The first other party is stored as opposing-party text on the case. Brief missing fields are structured (`{ key, label }`): `key` is a party key (`<role>Name`, `<role>Address`, `<role>IdNumber`), a field key of the document type (for example competent court, claim value, relief sought, service date, contested decision, appeal grounds), legal basis, factual description, or `other`, and `label` is a short Serbian phrase. The UI translates the lawsuit keys and otherwise shows the label. Older briefs (fixed plaintiff/defendant fields, or plain-string missing fields) are read as tužba briefs. Evidence items carry `provided` (already attached to the conversation). Task proposals are action-phrased Serbian titles from the document-type registry ("Pribaviti adresu tuženog", "Pribaviti osporenu odluku", "Utvrditi naknadu i uslove plaćanja"; unknown keys become "Pribaviti podatak: …"). The second group follows the document family: dokazi for court submissions ("Pribaviti dokaz: …"), prilozi for contracts ("Pribaviti prilog: …"), and isprave for letters and corporate acts ("Pribaviti ispravu: …"), and the group heading changes to match (`BriefTaskPreview.documentFamily`). grouped into missing data (preselected) and evidence, attachments or documents to obtain (not preselected, each group with "select all"); evidence already attached is not proposed. Each proposal has an editable due date — +3 working days by default, the next working day with `HIGH` priority for the service date (and for the publication date of a media reply), because the filing, appeal or request deadline runs from it — and created proposals show as done.
- The draft review panel shows a single "Za dopunu" checklist built from the `[UNOS POTREBAN: …]` placeholders in the current draft text (grouped by label, with an occurrence count). Each item can select the placeholder in the document text or fill every occurrence with a typed value; when none remain it shows a complete state. Model warnings are limited to ambiguities and legal risks and appear in a collapsed "Napomene za proveru" section. Approve and DOCX export ask for confirmation while placeholders remain, and an approved draft no longer shows Reject/Approve.
- Confirmed creates write activity-log rows with `metadata.source = "AI_ASSISTED"`. The approving user is the actor.
- Linked sessions and drafts appear on the case overview. Opening the assistant with `?caseId=` preselects that case and does not send a message.
- An empty conversation shows starter cards (`assistant-starter-prompts.ts`), each phrased for an existing agent tool. Without a linked case they cover today's agenda, deadlines in the next 48 hours, open and overdue work, hearings this week, active cases, client overview, legal research, the Advokatska tarifa (lookup only), drafting a tužba, an odgovor na tužbu, a žalba, a predlog za izvršenje, a contract (client picker), an opomena pred utuženje (case picker), a media reply or correction request, or a punomoćje (client picker), contract review (document picker or attach), document analysis, a deadline from a served document (document picker or attach), and setting a deadline. A case-linked conversation (`?caseId=` or a linked session) shows case cards instead: summary, open work, recent activity, documents, case timeline, drafting a tužba, a žalba or an opomena, reviewing a contract, a deadline from a case document, and a deadline on the case. Complete questions (`send`) are sent at once, creating the session if needed. Cards that need detail (`compose`) only fill the composer and focus it. Cards that need a record open a searchable picker dialog first (Spartan Command). The general set is grouped as Moj rad, Predmeti i klijenti, Pravo, and Nacrti i dokumenti. Pickers exist for case overview, case work, case activity, client overview, a colleague's schedule, draft a tužba, draft an odgovor na tužbu (the served lawsuit), draft a žalba (the decision), draft a predlog za izvršenje, set a deadline, and analyze a document. Cases and clients are searched on the server, colleagues are filtered locally ignoring diacritics, and documents are searched by title (non-archived, with a file). The picked record goes into the prompt as an exact reference: case number, client number, full name, or `doc:<id>`. A picked case is only named; the conversation is not linked to it. The document pickers can instead fall back to attaching a new file. Portir's practice rule accepts short office read queries (tasks, deadlines, hearings, agenda, cases, clients, documents, activity) as legal requests.
- When a session is linked to a case (brief apply, manual link, or an approved `link_case` proposal), and when files are uploaded to a session that is already linked, each chat attachment is filed as a workspace document on that case and its client (`ChatAttachment.documentId`, idempotency key `chat-attachment:<id>`). The document is linked to the attachment's shared content row (`ChatAttachment.contentId`; attachments uploaded before content rows existed are hashed from their stored bytes at filing time) and is created with `aiAccess = true`, so extracted text, chunks and facts are shared rather than copied. The `DOCUMENT_CREATED` activity row has `metadata.source = "CHAT_ATTACHMENT"`. Filing is best effort: a failure (for example a file type the document store rejects) never blocks the link and is retried on the next link or upload.
- Chat uploads are hashed (SHA-256 of the bytes) and linked to a per-workspace `DocumentContent` row (`ChatAttachment.sha256`, `contentId`), so the same file uploaded in several sessions or filed as a document shares one text, one set of chunks and one ingestion run. Every upload requests ingestion; a queue failure is logged and never fails the message. `ChatAttachmentSummary.aiStatus` is the content's AI status (`QUEUED` when no content yet; `OFF` never applies to unfiled attachments), and the session SSE stream emits `document.content.updated` (`attachmentIds`, `status`) per session when ingestion progresses. Drafting reads attachment text through the shared content (`DocumentContentService.ensureText`); attachments without content fall back to the older per-attachment extraction columns.
- All LLM calls go to OpenRouter through the Mastra model layer (`@law/mastra`); there is one assistant engine and no engine flags.
- Every message first passes Portir triage, which sees the recent conversation. Non-legal and unclear requests get a short reply and no further work. Every legal request becomes one `agent-turn` job run by the multi-turn `legalAssistant` agent:
  - The agent receives the session's recent messages (in Latin script, within a budget) and the linked case.
  - It can call two read-only tools: `search_legal_sources`, the pgvector legal knowledge base with `[n]` citations stored on the answer, and `get_case`, which returns the linked case or a search by number or name. For a single case it also returns the current responsible lawyers and the number of open tasks and deadlines.
  - Read-only office tools answer everyday practice questions from the existing services, scoped to the workspace:
    - `search_cases` and `search_clients` return filtered lists.
    - `get_client` returns one client with contacts and open cases. It never returns JMBG, ID documents, or addresses.
    - `list_work_items` lists tasks, deadlines, and events by case, client, or person, by state (open/done/all), by due-date range, or overdue only. With no filter it uses the linked case, or else the current user.
    - `get_agenda` returns the merged calendar for up to 31 days.
    - `list_activity` merges logged calls/meetings/emails and task/deadline/event changes for a case or client, newest first.
  - Read-only document tools cover the conversation's attachments that are not filed yet and the non-archived documents of the conversation's case, including documents uploaded through the upload modal:
    - `list_documents` returns refs, titles, file names, and text status.
    - `read_document` returns the text in windows of 12,000 characters with `nextOffset`.
    - `search_documents` finds a word or phrase in the text, ignoring case, script, diacritics, and line breaks. It returns up to 10 snippets per document with offsets and names the documents that have no readable text.
    - `read_document` and `search_documents` also accept an explicit `doc:<id>` ref for any non-archived workspace document with a file, even outside the conversation's case (for example one chosen in the starter-card picker). `list_documents` is unchanged.
    - Text is extracted lazily on the first read and stored on `DocumentVersion` (or on the chat attachment). The prompt tells the agent to search or read before saying it cannot access a document. There are no embeddings over office documents.
  - "Me" is the conversation's owner, who is named in the agent prompt. A colleague can be named instead; matching is diacritic-insensitive and tolerates Serbian case endings. An ambiguous or unknown person, case, or client returns candidates or a message instead of a guess. Lists are capped and report truncation; journal text is clipped to 500 characters.
  - Answers stream over the same SSE events and support feedback and regenerate.
  - Drafting requests also go to the agent. Its `draft_document` tool takes a `documentType` and runs the Mastra `document-drafting` workflow:
    - Supported types come from one registry (`@law/brief-extraction` `document-types.ts`) in four families:
      - Court submissions: `LAWSUIT` (tužba), `STATEMENT_OF_DEFENCE` (odgovor na tužbu), `APPEAL` (žalba), `ENFORCEMENT_MOTION` (predlog za izvršenje), `SUBMISSION` (podnesak).
      - Contracts: `SERVICES_CONTRACT` (ugovor o pružanju usluga), `NDA` (ugovor o poverljivosti), `EMPLOYMENT_CONTRACT` (ugovor o radu, with every mandatory element of the Zakon o radu present or marked as a placeholder), `COPYRIGHT_LICENCE` (licenca / ustupanje autorskih prava).
      - Letters: `DEMAND_LETTER` (opomena pred utuženje), `TERMINATION_NOTICE` (izjava o raskidu ugovora), `MEDIA_REPLY_REQUEST` (zahtev za objavljivanje odgovora / ispravke).
      - Corporate: `POWER_OF_ATTORNEY` (punomoćje), `CORPORATE_DECISION` (odluka organa društva, one party).
    - Each type defines its parties, its fields, the sections of the document, its legal frame, and its drafting rules; the brief and drafting prompts are built from it. The office has no house templates, so drafts use standard wording. The agent asks when the type or the represented side is unclear (for a contract, which party is the client), and declines document types the tool does not list.
    - It builds the brief from the conversation's client messages, the session's attachments, and filed documents named in `documentRefs` (`doc:<id>`, for example the judgment under appeal), reusing extracted text. An attachment already filed as a named document is read once.
    - It then grounds and drafts the document. The `[UNOS POTREBAN: …]` placeholder, citation, and no-invention rules are the same for every type.
    - Results are saved through the usual `brief-extraction` and `drafting` jobs, so the Case-work and Draft review panels work as before. `BriefExtractionResult` and `DraftResult` store `documentType` (default `LAWSUIT` for older rows), draft responses return it, and the Draft review panel shows it in its title. DOCX export uses the type for the document title (in the export script) and the file name (for example `zalba-<session>-<date>.docx`). A retried `brief-extraction` job keeps its stored type (older jobs are tužbe).
  - `review_contract` reviews a contract from the conversation's attachments or filed documents (`att:`/`doc:` ref) and stores a read-only `DocumentAnalysis` row (kind `CONTRACT_REVIEW`, linked to the session and its case):
    - Each review uses a built-in checklist (`@law/contract-review`): `SERVICES_CONTRACT`, `NDA`, `EMPLOYMENT_CONTRACT` (the mandatory elements of the Zakon o radu), `COPYRIGHT_LICENCE`, or a generic `OTHER_CONTRACT`. There is no office playbook yet.
    - The Mastra `contract-review` workflow grounds on the checklist's legal frame and compliance points (best effort), then makes one structured call. The result has a summary, key terms with clause references, findings, missing clauses, and warnings. Each finding is `RISK` (unfavourable for the client) or `COMPLIANCE` (conflicts with mandatory law), rated `HIGH`, `MEDIUM` or `LOW`, with a quote, an explanation, and suggested wording. Findings are ordered by risk, and only legal-source markers from this run are kept.
    - The agent passes the party the office represents (`clientSide`) and asks when it is unclear; without it, risks are assessed for both sides. Contracts longer than `CONTRACT_REVIEW_MAX_CHARS` (60,000 by default, including sources) are reviewed up to the limit and marked truncated.
    - A review changes no cases, clients, tasks, deadlines, or documents, and proposes nothing. The new review is announced with the SSE event `analysis.updated`; the session detail returns `analyses`.
    - The right rail gets an "Analiza" tab next to Draft and Case-work, which opens for a new review. It shows the summary, the client side, key terms, findings grouped by risk with quote, explanation, suggestion, and `[n]` markers, missing clauses, notes, and sources. `GET /chat/analyses/:analysisId/export?script=latin|cyrillic` returns a DOCX memo ("Analiza ugovora") and writes an `analysis.exported` audit event.
  - `summarize_case_documents` builds a sourced chronology of the conversation's case documents and unfiled attachments (or only the named refs) and stores it as a read-only `DocumentAnalysis` of kind `CASE_TIMELINE`:
    - Limits: at most 20 documents (the rest are listed as skipped) and 24,000 characters per document, read in windows of 12,000.
    - The Mastra `case-timeline` workflow extracts events per window (three calls in parallel). Each event has a date, the date as written, a kind (filing, decision, hearing, correspondence, contract, payment, deadline, other), a title, a description and a quote.
    - The code then attaches each event's source document, keeps only real dates (`YYYY-MM-DD`, `YYYY-MM` or `YYYY`), and keeps a quote only when it occurs in the source text. It merges duplicates and sorts the events, with undated ones last.
    - A final call writes the case summary, open questions and warnings from the document summaries and the merged events; it cannot add events.
    - Every document is reported as read, partly read, without text, failed, or skipped. A failing document does not stop the others; only when every document fails does the tool report a failure.
    - The rail's "Analiza" tab shows the latest analysis of either kind. For a timeline it shows the summary, open questions, events grouped by year (date, kind, title, description, quote, source), and the documents with their status.
    - The case's Assistant tab shows the latest timeline (date, summary excerpt, number of events) with a link that opens that conversation (`/assistant?sessionId=`; the assistant opens it even when it is not on the first page of conversations).
    - The case card "Hronologija predmeta" asks for it in a case-linked conversation. Only contract reviews can be exported to DOCX.
  - Case detail (overview card and Assistant tab) lists the case's conversations and drafts:
    - Each conversation row shows its last-updated date and draft count, and opens that conversation (`/assistant?sessionId=`).
    - Each draft row shows the translated document type, approval status and creation date, and opens its conversation; the rail then shows the conversation's latest draft.
    - Only "Start assistant" passes `?caseId=`, so a new conversation is linked to the case. Opening an existing conversation does not link new ones.
  - `revise_draft` creates a new draft version from a chat instruction (for example "skrati obrazloženje"). `get_draft` and `list_conversation_drafts` read the conversation's drafts, which the agent also sees in its context.
  - A turn that produced a draft is marked `DRAFT_READY`. Every draft still needs lawyer approval in the review panel.
  - "Request changes" in the draft review panel queues a `drafting` job that the same Mastra `draft-revision` workflow runs; the new version is announced with "Nacrt je spreman za pregled." Retrying a failed `brief-extraction` or `drafting` job reruns it from its stored input. Older queued `answering` jobs run as agent turns.
  - `detect_deadlines` computes the deadline to respond to or challenge a served document. It has the side-effect level confirm and never computes the date with the model.
    - **Classification (Mastra `deadline-detection` workflow).** The model only classifies the act and the civil procedure kind. It also returns the remedy instruction, the period the instruction states, and a service date only when the document says so. Each comes with a verified quote. Long documents send the head and the tail (40,000 characters).
      - Act kinds: first-instance judgment or ruling, platni nalog, a lawsuit, appeal or revizija served for a response, a second-instance judgment, an enforcement order (on a verodostojna isprava, an izvršna isprava, or in the skraćeni postupak), another enforcement ruling, an administrative decision, a final administrative act, a decision of the Upravni sud, and other.
    - **Rules (`@law/legal-deadlines`).** The rules table gives the period and its legal basis:
      - ZPP čl. 297, 367, 380, 402, 403, 411, 446, 452, 457, 479, 493; no odgovor na tužbu in small-claims or consumer disputes (čl. 472, 487, 489).
      - ZIO čl. 25, 73, 86, 326g.
      - ZUP čl. 153.
      - ZUS čl. 18, 51.
    - **Counting.** Counting follows ZPP čl. 103 and ZUP čl. 80: the day of service is not counted, and a last day on a Saturday, Sunday or public holiday moves to the next working day.
    - **Non-working days.** The calendar follows the Zakon o državnim i drugim praznicima:
      - Nova godina, Božić, Sretenje, Praznik rada and Dan primirja.
      - Orthodox Vaskrs from Veliki petak to Monday.
      - A state holiday falling on a Sunday makes the next working day non-working.
      - Dan pobede is a working day.
    - **Service date.** The service date comes from the user, or from the document only with a verified quote, flagged for the user to confirm.
      - Without a service date, the tool returns `NEEDS_SERVICE_DATE` and the agent asks for it. A future date is rejected.
      - If the remedy instruction states a different period, both dates are computed and the earlier one is proposed, with a warning.
    - **Proposal.** The result is proposed as a `create_deadline` PendingAction (type COURT, or STATUTORY for ZUP) on the linked case.
      - The title is "{pravni lek} – {broj predmeta}". The description names the document, the service date and its source, the period, the legal basis, how the days were counted, and warnings.
      - A deadline that has passed (`EXPIRED`) or that cannot be proposed, for example with no linked case (`NOT_PROPOSED`), is reported but not proposed. Documents with no deadline return `NO_DEADLINE` with the reason.
  - The agent can propose record changes: `link_case`, `create_deadline` (on the linked or named case, with the case's responsible lawyer), and `create_tasks_from_brief` (the brief must be applied to a case).
    - A proposal only stores a `PendingAction` and shows a confirmation card (Odobri / Odbij) under the message. The run waits in `WAITING_CONFIRMATION`.
    - Approval (`POST /chat/pending-actions/:id/approve`) executes the change through the existing services, with the approving user as the actor and an `AI_ASSISTED` activity log.
    - Decline (`…/decline`) writes nothing.
    - Proposals expire after 24 h, and double approvals execute once.
    - After the last decision, an `agent-resume` job lets the agent confirm the outcome.
  - Long conversations keep a rolling summary (`ChatSession.summary`). Once unsummarized turns exceed 80% of the history window (`ASSISTANT_HISTORY_MAX_MESSAGES`), or of its character budget, the oldest turns are folded into the summary after the turn completes. The agent sees the summary plus the recent turns verbatim.
  - Each agent tool call is stored (`AgentToolCall`: input, truncated output, status, duration) and streamed as `tool.started` / `tool.finished`. The assistant activity card lists tool steps (for example "Pretraga propisa „…“ · Rezultata: 4") live and after a reload, and while a tool runs its title reads "Pretražujem propise…".
- Workflow jobs record `startedAt` and `finishedAt`. `agent-turn` jobs also record the model and input/output tokens. `MASTRA_TRACING=true` (off by default) additionally exports Mastra traces to the separate `mastra` Postgres schema.

## References and user settings

documents,

- Workspace reference data, including users, is available to frontend forms and display components.
- User settings can be read and updated through authenticated API endpoints.
- User profiles can optionally store `MALE` or `FEMALE` gender. Profile Settings exposes translated Male, Female, and Not specified choices; Not specified clears the stored value.
- The frontend has profile, appearance, workspace, and data settings pages.
- Conversation history can be cleared for the current user and workspace, using a confirmation dialog and success/error feedback.

## Frontend infrastructure currently in use

- Standalone Angular components with signal-based state in the implemented feature areas.
- Reactive forms for clients, cases, events, assistant composition, and settings actions.
- Shared API-client services for authentication, chat, clients, cases, references, settings, calendar, events, tasks, deadlines, and activity logs.
- Authenticated application layout and routes for dashboard, clients, cases, documents, calendar, notifications, finance, reports, Team work (`/work/team`), My work (`/work/my`), settings, and assistant.
- Shared localization pipe/service, loading spinners, empty states, confirmation dialogs, toast feedback, and Spartan/UI components are used across the completed screens.

## Financials backend foundation

- Workspace organization/invoicing configuration is stored separately from general `WorkspaceConfig` in a one-to-one `OrganizationSettings` aggregate. Section-scoped APIs cover company identity, tax defaults, SEF configuration and attachment preferences, invoice numbering, payment defaults, currency settings, invoice presentation defaults, and optional invoice-payment QR configuration; bank accounts are separate archivable workspace records and QR settings reference one of them instead of duplicating account data. The SEF API key uses AES-256-GCM encrypted columns and normal reads expose only configured/masked state. SEF DEMO outgoing-invoice support now generates server-side UBL, validates it locally, stores immutable attempts and all three remote identifiers, uploads idempotently, and refreshes remote status manually. Production/CIR and unsupported scenarios remain blocked. Payment processing and NBS fetching are not implemented.
- Invoice numbers use a validated template engine (`YYYY`, `YY`, `MM`, `M`, `DD`, `D`, and one `SEQ`/`SEQ:n` token) with explicit never/yearly/monthly sequence scopes. Sequence state is stored by workspace and period, suggestions do not reserve a number, automatic invoice creation allocates atomically, and matching manually saved numbers advance the counter without lexical `MAX(invoiceNumber)` queries. The invoice composer exposes a localized manual number and **Predloži broj** action; database uniqueness remains authoritative.
- Settings → Workspace contains only notification and regional preferences. Settings → Company is a separate routed inner layout with Company, Tax, SEF, Invoice numbering, Payments, Currencies, Invoice defaults, and IPS QR payment tabs; every organization tab saves only its own section.

- The deterministic Financials backend bills **work entries** (`WorkEntry`, see "Work capture and retainers"), not tasks, events, or deadlines. `Task`, `Event`, and `Deadline` no longer carry a `invoiceId`, and the eligible-work endpoint is gone; completing a task/event/deadline instead silently creates a `PROPOSED` entry (no time prompt in the UI), which the user confirms in time review, with or without minutes. Only `CONFIRMED` entries (timed or untimed) that belong to the invoice's client and are not yet linked to a line can be billed. The former candidate-review and standalone invoice-line creation workflow has been removed.
- Billing invoice lines are required children of a invoice and cannot exist independently. Invoices store invoice creation, maturity, and turnover dates; place of issue, payment method, comment, cash-bill number, country; explicit net, VAT-rate, VAT-amount, and gross totals; an explicit SEF VAT-liability timing code; `printWorkSpecification` (default true; the print view appends a work-specification table of date, performer, entry title, and duration); and `billingMonth` for month-end drafts. Each line stores its own net amount, VAT rate, VAT amount, gross amount, explicit tax category/exemption data, `minutes`, and a `pricingRequired` flag. Server-side decimal checks enforce consistent two-decimal line and document totals. Creating or editing a draft invoice transactionally claims the selected entries (`workEntryIds`) with a status check (`CONFIRMED`, same client, no line yet), sets them `BILLED`, and links them to the line through `WorkEntry.invoiceLineId`; a concurrent claim fails with a conflict instead of double-billing. Lines flagged `pricingRequired` (typically `AT` work awaiting a tariff price) have no amount until a lawyer enters one, and **a invoice with any such line cannot be sent**. Removing a line, deleting a draft, or voiding a invoice releases its entries: they return to `CONFIRMED` (timed or untimed) and `invoiceLineId` is cleared. Sent and voided statements cannot be deleted. Sending a invoice marks its lines billed. All lines in one invoice belong to its client.
- SEF DEMO submission is a separate state machine (`PREPARED`, `SENDING`, `SUBMITTED`, `FAILED`, `UNKNOWN`) and never marks the local invoice sent or its work entries billed. Preparation locks the invoice, snapshots server-loaded issuer/client/address/account/tax data, stores validated XML and a SHA-256 hash, and atomically claims one upload. Active, uncertain, or submitted attempts block invoice/line mutation, deletion, local sending, and voiding; the existing void operation is explicitly not SEF cancellation/storno. Stale `SENDING` becomes `UNKNOWN` without automatic retry, while a successful upload remains `SUBMITTED` even when the first status read fails. Client records have explicit public-sector classification and JBKJS so v1 can reject CIR recipients rather than infer from names.
- Finance access is restricted in the service layer: `OWNER`/`ADMIN` manage office-wide financials, `LAWYER` can record and view permitted own work, and ordinary `MEMBER` accounts do not receive unrestricted finance access.
- The workflow does not issue tax/fiscal invoices, calculate tariffs or tax, process or record payments, create automatic charges, or call AI. Invoices may retain an external invoice reference, but the platform has no payment records or derived paid/outstanding status. A typed future proposal contract exists without a model/provider implementation.
- **Unbilled work (Neobračunat rad, `/finance/work-review`):** lists `CONFIRMED` work entries that no invoice bills yet, filterable by client (multiple), case, person, treatment, and date range. Selecting entries of one client (mixing clients is refused) opens a new invoice with those entries preloaded (`?clientId=&workEntryIds=`); a row can also start a invoice on its own or be written off through the same mandatory-reason flow used by Team time. Entries that are no longer confirmed, no longer unbilled, or belong to another client are skipped and the composer says so.
- **New-invoice numbering:** opening `/finance/invoices/new` automatically fills the current invoice-number suggestion; edit mode preserves the saved number and does not request a suggestion.
- **Statement composer:** the invoice list, detail page, and shared create/edit draft composer work against work entries. Successful saves open the invoice detail, whose print action opens a dedicated shell-free A4 invoice view with invoice, client, line, VAT, total, comment, and payment information plus browser printing. The print view derives issuer and bank details from Company settings. When optional payment QR is enabled, a reusable service validates the company, selected active RSD account, invoice currency/amount, purpose template, and optional reference, then produces an NBS IPS payload; invalid or missing configuration renders no QR, while `angularx-qrcode` only renders a valid final payload. The composer captures all invoice dates, issue/payment metadata, comment, country, cash-bill reference, the `printWorkSpecification` checkbox (default on), and per-line net/VAT/gross values. New invoices prefill maturity, issue place, payment method, country, currency, note, VAT values, and VAT-liability timing from the matching Organization settings; editing a draft fills only still-missing header values and preserves saved invoice data. The composer neither exposes nor submits SEF tax-category/exemption fields; that assignment remains backend policy. Issuer identity and address are not duplicated on the invoice and remain sourced directly from Organization settings during SEF preparation. Row net, VAT-rate, VAT-amount, and gross edits recalculate their dependent values immediately without event loops; invoice net, VAT-amount, and gross totals are derived from the rows, while the invoice VAT rate remains user-controlled. "Uvezi neobračunat rad" opens a modal listing the confirmed unbilled entries of the invoice's client (case filter, paged, already-added entries marked); each imported entry becomes one line carrying `workEntryIds`, `minutes`, and the description "{naslov} ({h} h {m} min)" (just "{naslov}" for an untimed entry, which always gets a zero amount with `pricingRequired`). An `HOURLY` entry is priced as minutes/60 times the client's billing-profile hourly rate (half-up to 2 decimals, integer arithmetic) when that rate is in the invoice currency; every other entry gets a zero amount with `pricingRequired`. Flagged rows show a "Cena nije uneta" badge and may stay at zero; entering a positive amount on a row clears its flag, while an unflagged row still needs a positive amount. Manual lines remain possible. Changing the client during new-invoice composition preserves row values but detaches the old work entries from their rows (they become manual lines). Draft rows expose edit and confirmed-delete actions; deletion is enforced server-side as draft-only. Currency entry and filtering use one ordered supported-currency list, retain ISO codes in API values, and display localized currency names.
- **Sending and the work specification:** the invoice detail page shows a "Pošalji" button for drafts, after confirmation. It is disabled with an explanatory tooltip and notice while any line is `pricingRequired` (the API enforces the same rule with a 409 "Price every line before sending"), and flagged lines carry the same badge there. When `printWorkSpecification` is on and the invoice has entry-backed lines, the print view appends a "Specifikacija rada" table (Datum, Izvršilac, Opis, Trajanje) of every line's work entries sorted by date, with a total duration row; with the flag off, or with only manual lines, nothing is appended.
- **Month-end page (`/finance/month-end`, OWNER only; route guard and sidebar entry both hide it from every other role):** a month picker (default: the previous month) drives step 1, a precheck table per client of the month's `PROPOSED` and `CONFIRMED`+`UNDECIDED` entries with inline "Potvrdi" (opens the capture dialog; a confirmed entry without treatment is edited instead) and "Otpiši" (write-off dialog with a mandatory reason), reloading the check after each action. Step 2, "Generiši nacrte", is enabled once the check has loaded; when open entries remain it first asks for confirmation (open entries are not included in the drafts). The result table lists every row the run returns, with an "Otvori obračun" link when a invoice id is present, the outcome (created, updated, "Dodato u postojeći paušal: N" when only covered work joined the fee line already on the draft, or "Bez promena" only when nothing happened), lines added, and lines still to price. A client that could not be billed because the entries were claimed or the draft changed mid-run (rolled back) is shown in the error color as "Nije obračunato: {razlog}" with the reason, never as "no changes"; running the month end again retries it. The run is idempotent, so repeating it only adds new confirmed work.
- Financial filters use searchable content-width comboboxes where supported: Unbilled work accepts multiple clients, people, and treatments plus a single case, and the invoice list accepts multiple clients over its loaded result set. Price-source client agreements use a searchable single-client combobox because each price source stores one `clientId`.

## Work capture and retainers

The Angular screens for quick capture, the header timer, review, My/Team time, billing settings, Retainers, Unbilled work, entry-based statements, and the month-end run, and the Profitability page are implemented. AI is optional: every flow below works without it.

### Work entries and statuses

- A `WorkEntry` is the single billable unit: performer (`userId`), `clientId` (required), optional `caseId` (must belong to the client), optional `taskId`, `workDate`, optional `minutes` (1 to 1440; empty means untimed work priced on the invoice), a required one-sentence Serbian Latin `title` (max 200 characters; existing entries were backfilled with the first sentence of their description), an optional Serbian Latin `description` (notes), optional `ServiceCategory`, `treatment`, `status`, and a `source`. All reads and writes are scoped by `workspaceId`; mutations write activity-log rows.
- Statuses: `RUNNING` (timer, no minutes yet), `PROPOSED` (needs a decision; minutes may be empty), `CONFIRMED` (ready to bill; minutes optional, but a running timer must be stopped first), `BILLED` (linked to a invoice line; immutable), `WRITTEN_OFF` (a reason is required). A user has at most one `RUNNING` entry, enforced by a partial unique index.
- Treatments: `RETAINER`, `AT`, `HOURLY`, `NON_BILLABLE`, `UNDECIDED`.
- Permissions: users create and change their own non-billed entries. `OWNER`/`ADMIN` see and change everyone's and are the only ones who may delete a written-off entry. A `LAWYER` also reads entries on cases where they are a current responsible user. A `MEMBER` sees only their own. Billed entries cannot be edited, written off, or deleted.
- Endpoints (`work-entries`): list, get, action eligibility (`:id/actions`), create (`CONFIRMED`), update, confirm, write-off, delete, timer (get/start/stop), `from-source`, and `parse`.

### Sources

- `MANUAL` and `QUICK_CAPTURE`: created `CONFIRMED`, with or without minutes. The capture dialog asks for client and the one-sentence title ("Opišite rad jednom rečenicom", also the text the AI "Popuni" button reads; the parsed summary replaces it); duration and "Opis rada" are optional. Only confirming a stopped timer requires minutes. `QUICK_CAPTURE` entries set `aiParsed` when the form was prefilled by AI.
- `TIMER`: start on a client (and optional case), stop to set minutes as elapsed time rounded up to the next minute (capped at 1440). Stopping leaves the entry `RUNNING` with minutes for the user to confirm.
- Automatic source entries (`TASK`, `EVENT`, `DEADLINE`): completing a record without an explicit capture proposes work for its performer if it resolves to exactly one client. Event duration supplies minutes for timed events. `sourceType`/`sourceId` remain unique per workspace for these automatic proposals; repeated completion does not duplicate them. Task proposals also carry `taskId` and are skipped if the task already has linked work. Events still complete without a capture prompt. `POST work-entries/from-source` confirms an automatic proposal, with or without minutes.
- Tasks support multiple work entries through optional `WorkEntry.taskId` (foreign key; existing task-source entries are backfilled). The task card/list action **Add work** and the task-details **Work on this task** section open prefilled quick capture. Saving adds a new confirmed entry for the current user with source `TASK`, without changing task status or modifying previous entries. The detail section lists title, notes, date, performer, duration and status, with pagination, loading, error/retry and empty states. Lists retain existing work-entry role restrictions and refresh after capture. Client, case, title and description come from the saved task; users can adjust capture fields. Duration is optional.
- Task-detail work rows are keyboard-accessible buttons that open the saved entry in quick capture. Entry management loads server-reported edit/delete eligibility; billed or otherwise non-editable entries can still be viewed. A lower-left Delete button requires a confirmation dialog. The task's only remaining work entry cannot be deleted: the modal explains that another entry must be added first. The API enforces this rule for every task-linked deletion, regardless of task status or entry-list pagination/role filters, and locks the task before counting and deleting so concurrent requests cannot delete the final two entries. Existing ownership, written-off and billed-entry restrictions remain in force. Edits and confirmed deletions refresh the task's work list; cancellation and errors leave the entry intact.
- Task completion (drag/drop, status selector, completion action or task editor) opens prefilled quick capture. If visible linked work exists, the dialog also offers **Finish task without new work**, which bypasses capture-field validation and sends an explicit completion choice. The API checks for linked work in the same workspace and rejects the action if none remains; it inserts no work or proposal. Saving normally adds a new confirmed work entry for the assignee and completes the task atomically, preserving prior entries even on reopened tasks. Concurrent/retried completion requests are serialized before reading task status, so only the first transition inserts work. Cancel before submission preserves status and writes nothing; failure leaves the dialog retryable and rolls back completion. A newly created task selected as DONE still requires capture. Editing an already completed task does not prompt again. Work entries added independently remain after task reopening.

- `ACTIVITY`: logging a `PHONE_CALL`, `MEETING`, or `EMAIL` client/case activity creates a linked entry (`CLIENT_ACTIVITY`/`CASE_ACTIVITY`); with `durationMinutes` it is `CONFIRMED`, otherwise `PROPOSED`. The activity row itself stays the journal and stores no duration.
- The `EMAIL` source value exists in the database enum for the later Outlook connector but nothing produces it yet.

### Default treatment from retainers

- A client may have several `RetainerAgreement`s (non-overlapping in time) with monthly fee, currency, validity range, optional included minutes (no value means no cap), covered `ServiceCategory` list (empty means everything), and separate overage and out-of-scope rules (`HOURLY`, `AT`, or `ABSORBED`; `HOURLY` requires a rate).
- A new entry's treatment defaults from the agreement active on `workDate`: a covered category (or an agreement with no category list) gives `RETAINER`; otherwise the out-of-scope rule (`HOURLY`, `AT`, or `RETAINER` when `ABSORBED`); with no agreement it is `UNDECIDED`. The user can override it. Out-of-scope work under an `ABSORBED` out-of-scope rule is treated as retainer work and counts toward the agreement's included hours (owner-confirmed 2026-10-04).
- `ClientBillingProfile` (hourly rate and currency per client) prices `HOURLY` entries for clients without a retainer. `UserRate` (internal hourly value, effective from a date, in the workspace `internalCurrency`) and `WorkspaceConfig.targetHourlyRate` feed profitability only. Categories, retainers, profiles, and rates are managed through `billing-setup` endpoints by `OWNER`/`ADMIN`. Workspaces are seeded with seven service categories (_Korporativno savetovanje_, _Pregled ugovora_, _Izrada ugovora_, _Medijsko pravo_, _Parnica_, _Upravni postupak_, _Ostalo_).

### AI free-text capture (never writes)

- `POST work-entries/parse` sends one sentence to a synchronous structured `ChatModelProvider` call (OpenRouter through the Mastra model layer, 10 second timeout) and returns suggested client, case, minutes, category, and a cleaned summary (used as the entry title). It writes nothing; the user still presses Save.
- Client and case matching reuses the diacritic-insensitive matching helpers. An ambiguous name leaves the field empty and returns up to five candidates. A missing API key, timeout, or invalid model output returns `ok: false` with empty fields, so the form keeps working manually.

### Timer and review notifications

- The hourly reminder runner sends `TIMER_RUNNING_LONG` to the performer when a timer has run longer than four hours or crossed local midnight (deduped per entry and start time).
- `TIME_REVIEW_REMINDER` is a weekday nudge sent once per local date at or after the user's configured time, only for users who enabled the review reminder in their settings (default off).

### Retainer usage and 80/100% alerts

- Usage per client and month reports covered (`RETAINER`) minutes against the included minutes, out-of-scope minutes, and the effective hourly rate (fee divided by hours). `OWNER`/`ADMIN` see every client; a `LAWYER` sees only clients they are responsible for. A mid-month start or end prorates the cap by days, rounded down to whole minutes.
- After an entry is confirmed, covered minutes reaching 80% or 100% of the prorated cap send `RETAINER_USAGE_80` or `RETAINER_USAGE_100` to the client's responsible user (the workspace owners when none is set), deduped per agreement, month, and level. Uncapped agreements never alert.

### Month-end billing run (owner only)

- `billing/month-end/:month/precheck` lists, per client, entries still `PROPOSED` or `UNDECIDED` in the month so nothing silently falls out. `billing/month-end/:month/run` creates draft statements; only the `OWNER` may call either.
- One draft per client and currency (with `billingMonth` set). Lines in order: retainer fee ("Paušal za {mesec} {godina}", prorated by days for a mid-month start or end), overage above the included minutes in chronological order priced by `overageRule` (`ABSORBED` adds no line but still marks the entries billed against the fee), out-of-scope work grouped by case (or category when there is no case) priced by `outOfScopeRule`, non-retainer `HOURLY` work priced from the client's billing profile, and `AT` work as lines with an empty amount and `pricingRequired`. Untimed entries are included: untimed `RETAINER` work is always covered by the fee (it adds 0 minutes and never counts as overage), and each untimed `HOURLY` entry becomes its own `pricingRequired` line described as "{broj predmeta} {naslov}". Missing rates also produce `pricingRequired` lines instead of guessed prices. The fee line is marked structurally (`sourceType` `RETAINER_FEE`, `sourceId` = the agreement id), never recognised by its wording: rewording it in the composer does not make the next run add a second fee, a hand-typed "Paušal za…" line does not suppress the real one, and each agreement of a month is matched on its own line. Saving a draft in the composer keeps the marker by line identity: the composer sends each existing line's `id`, and a replacement line whose `id` matches a marked line of that same invoice is recreated with the same marker, even when its amount and wording were edited and it has no work entries. An `id` that does not belong to the invoice is ignored (clients cannot forge a marker), and a marked line missing from the input counts as deliberately removed, so no other line inherits the marker. New composer lines send no `id`. Covered work for a fee already on a sent invoice is added as a 0.00 "dodatni rad u okviru paušala" line carrying the same marker.
- Idempotent: billed entries are never touched; a re-run adds only new confirmed entries, and joins an existing draft for that client and month instead of creating a second one or charging the fee twice. Entries are claimed inside a transaction with a status check, serialized per client and month, so concurrent runs cannot double-bill. If another run claims the entries first, only that client rolls back. Nothing is sent automatically.

### Profitability report (owner and admin)

- `billing/profitability?from=&to=` returns, per client, revenue (net of `SENT` statements by turnover date; payments are not tracked), internal value of time (minutes times the performer's `UserRate` effective on `workDate`), hours, effective hourly rate against the office target, written-off value, and confirmed-but-unbilled value, sorted by effective rate ascending. Entries whose performer has no rate count their hours but contribute no value and are reported as unknown rather than guessed. The report also carries a per-person breakdown of logged versus billed minutes; other roles get a forbidden error.
- The Angular page `reports/profitability` (card on Reports, `OWNER`/`ADMIN` route guard) shows last month by default, this month, last 3 months (Europe/Belgrade calendar) or a custom range, a worst-first client table and a person tab (logged versus billed hours, utilization). A rate below the office target is shown in the destructive color (exact decimal comparison); rows note "nije uporedivo" and the hours whose value is unknown.

### Demo data

- `npm run db:seed:demo` seeds the service categories, a user rate per demo user (partner 9000, lawyer 6000, trainee and staff 2500 RSD), a 7000 RSD office target, a capped retainer (20 h, 120 000 RSD, `HOURLY` overage 6000, out-of-scope `AT`), an uncapped `ABSORBED` retainer (60 000 RSD), an EUR 120 hourly profile, and about 40 September 2026 entries covering every status and source. The seed is idempotent.

## Partial or not finished yet

These areas have routes or backend groundwork but should not be described as completed end-to-end business workflows:

- **Client detail tabs:** the client detail page declares documents, activities, and financials tabs, but the inspected component primarily loads overview data and related cases. These tabs need their own complete UI/data workflows before they can be counted as finished.
- **Finance, reports, notifications, and dashboard:** financials has implemented billing-review and invoice-management surfaces but remains in progress as an overall product area. Reports, notifications, and dashboard completion should be assessed separately from the implemented client, case, calendar, assistant, and document workflows. A route alone is not evidence that the underlying business logic is finished. The documents workspace is implemented as described above.
- **Automated backend coverage:** backend specs do not live under `libs/api/features`; they are in `apps/api/src/app` (for example `activities-tasks-deadlines`, `financials`, `month-end-run`, `work-entry-sources`, `work-entries` and the assistant services), run with `npx nx test api`. Some domain services and query extensions are still covered only indirectly.
- **Board “Load more”:** pagination is tracked per record type (Task/Deadline/Event), not per rendered board column, so a column fed by more than one record type can require more than one “Load more” action to reveal further items of a specific type.
- **Calendar List/Board filter persistence:** Calendar’s List/Board presentation deliberately does not sync its own filter state into the URL (to avoid overwriting the calendar’s `view`/`date` query parameters), so those filters reset on a full page reload, unlike the dedicated Team work/My work pages.

## Main conclusion

The strongest completed product slices are authentication, client management, case management, calendar/events, assistant/chat/drafting, and the unified work-tracking experience (Team work, My work, Calendar List/Board, and Case → Work). The work-management backend now supports paginated, multi-value, and free-text-searchable task/deadline/event queries, contextual filtering, due-target forms, transitions, validation, workspace isolation, and activity logging, all consumed through one shared frontend component instead of duplicated screens. Client detail integration, focused backend tests, and per-column board pagination remain outstanding.

## Company case numbering and linked-task capture (2026-10-08)

- Settings → Company → Other settings persists a workspace case-number pattern. It uses the same date and sequence tokens as invoice numbering, with exactly one `{SEQ}` or `{SEQ:n}` token. Validation preserves case-number character and length constraints and reserves room for sequence growth. Case and invoice numbering previews appear before the fields; the Serbian invoice tab is “Numeracija fakture”.
- `/cases/next-number` reads the saved pattern by default, and the case form uses that default when initially suggesting or refreshing its number. Existing case numbers remain unchanged. Suggestions continue above both the greatest matching sequence and total case count; explicit legacy format queries remain supported. Database errors on the configured path are surfaced rather than replaced with a potentially duplicate fallback number.
- Quick capture shows a bounded, truncated linked-task title with a tooltip in the header. The button loads current task details and opens the task modal without discarding capture input; saved entries also recover their task link on load. Treatment choices use labeled radio buttons and preserve existing defaulting, read-only and saving behavior.

## Work-entry view mode (2026-10-08)

- Quick capture has an explicit view mode for saved work. It displays title, notes, client, case, performer, date, duration, category, treatment, status and write-off reason when present, with the linked-task shortcut and Close. It omits form controls, capture helpers, Save, Delete and completion actions; loading failures offer Retry. Explicit view mode loads the entry without editor option-list or action-policy requests.
- My Time entries remain clickable after billing or write-off; Team Time and Time Review offer View for non-editable entries. Task work rows also select view mode for BILLED, WRITTEN_OFF and RUNNING entries. An edit request that loads an immutable entry or receives a non-editable task-entry policy renders the same view, and mutation handlers refuse to run. Editable entries retain existing editing/deletion rules.

## Work review status filtering and restoration (2026-10-08)

- Finance work review defaults to CONFIRMED, unbilled entries. Its status filter also offers PROPOSED, RUNNING, BILLED, WRITTEN_OFF and all statuses; other statuses are not restricted to unbilled entries. Filter changes reset pagination and selection. A status column and View column identify and open each entry. Invoice selection and creation remain limited to confirmed work with no linked invoice.
- View opens editable work in quick capture; billed and running work open the read-only view. Written-off work opened from review is editable and has a status choice to keep WRITTEN_OFF or restore CONFIRMED. Save applies edits and restoration atomically, clears the current write-off reason and records the previous status/reason in the activity log. The server preserves workspace/ownership checks, refuses restoration from other statuses, and rejects concurrent status changes. Successful edits and write-offs reload the active filtered list.
