# Business Logic Done So Far

**Checked:** 2026-09-23
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

Authenticated document APIs are implemented. The Angular documents library (list, archive, download) is still a placeholder; a reusable upload modal is implemented.

- `POST /api/documents` uploads one streamed file (`multipart` field `file`) with title and optional `caseIds`/`clientIds`. `Idempotency-Key` is required.
- Paginated list (`archived` defaults to active-only; `true`/`false`/`all`), detail, metadata/link patch (arrays replace when present), version upload/list, current and historical download, archive, and restore.
- Bytes live under `FILE_STORAGE_ROOT` with generated keys. Metadata and the recorded storage connection stay in PostgreSQL. Chat uploads are not moved.
- Linked cases and clients must belong to the workspace (400 when unavailable). Archive hides from the default list; authorized detail and download still work.
- Document list/detail responses include shallow linked case and client display objects for each document link.
- There is no virus-scanning claim, no cloud adapter, and no permanent delete in this slice.
- Each document version can carry extracted Serbian Latin text (`extractionStatus`, `extractedText`, `sourceScript`). The assistant fills it lazily; it is not exposed in the document API.

## Workspace documents (upload modal)

- Documents, client detail, and case detail can open a reusable upload dialog against `POST /api/documents`.
- Each selected file is its own document. Title is required (max 320). Case/client links are locked on those detail pages and searchable on the documents page.
- Upload uses XHR progress (`withXhr()`), concurrency 2, and a frozen `Idempotency-Key` on retry. Optional per-row category codes are stored on `Document.category`. Clients are selected before cases; case search is constrained by selected clients. Version-mode queue exists; there is no version UI entry in this slice.
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
- Activity-log listing is available with case and client filters.
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
- Event detail popovers/menu actions and event create/edit dialog.
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
- Item actions reuse the existing Task/Deadline/Event dialogs and transition endpoints (create, edit, complete/cancel/reopen for tasks and deadlines; complete/cancel for events, which have no reopen). Board also supports drag-and-drop between columns, restricted to the same backend-supported transitions as the action buttons — a drop with no corresponding transition (for example, dragging a cancelled item, or dragging an event back out of Completed/Cancelled) is rejected rather than silently allowed.
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
- After brief extraction, the Case-work pane opens in the right rail (shared with the Draft review panel via a compact Draft / Case-work tab switcher shown only when both exist), without narrowing the chat column. A fresh brief auto-expands the rail on the Case-work tab and a fresh draft opens the Draft tab; refresh/SSE updates never re-expand a rail the user collapsed, switching sessions collapses it, and deleting the active session resets the brief/rail state. Nothing remains in the message stream. The lawyer confirms a client and case separately from tasks. Plaintiff becomes the client (existing match or a new individual). Defendant is stored as opposing-party text on the case. Brief missing fields are structured (`{ key, label }`): `key` is one of a canonical list (plaintiff/defendant name, address and ID number, competent court, claim value, legal basis, factual description, relief sought, service date of the contested act, contract reference, or `other`) and `label` is a short Serbian phrase. The UI translates known keys and shows the label for `other`; older briefs stored as plain strings are normalized on read. Evidence items carry `provided` (already attached to the conversation). Task proposals are action-phrased Serbian titles ("Pribaviti adresu tuženog", "Pribaviti dokaz: …"), grouped into missing data (preselected) and evidence to obtain (not preselected, each group with "select all"); evidence already attached is not proposed. Each proposal has an editable due date — +3 working days by default, the next working day with `HIGH` priority for the service date, because the filing deadline runs from it — and created proposals show as done.
- The draft review panel shows a single "Za dopunu" checklist built from the `[UNOS POTREBAN: …]` placeholders in the current draft text (grouped by label, with an occurrence count). Each item can select the placeholder in the document text or fill every occurrence with a typed value; when none remain it shows a complete state. Model warnings are limited to ambiguities and legal risks and appear in a collapsed "Napomene za proveru" section. Approve and DOCX export ask for confirmation while placeholders remain, and an approved draft no longer shows Reject/Approve.
- Confirmed creates write activity-log rows with `metadata.source = "AI_ASSISTED"`. The approving user is the actor.
- Linked sessions and drafts appear on the case overview. Opening the assistant with `?caseId=` preselects that case and does not send a message.
- An empty conversation shows starter cards (`assistant-starter-prompts.ts`), each phrased for an existing agent tool. Without a linked case they cover today's agenda, deadlines in the next 48 hours, open and overdue work, hearings this week, active cases, client overview, legal research, the Advokatska tarifa (lookup only), lawsuit drafting, document analysis, and setting a deadline. A case-linked conversation (`?caseId=` or a linked session) shows case cards instead: summary, open work, recent activity, documents, drafting, and a deadline on the case. Complete questions (`send`) are sent at once, creating the session if needed. Cards that need detail (`compose`) only fill the composer and focus it. Cards that need a record open a searchable picker dialog first (Spartan Command). The general set is grouped as Moj rad, Predmeti i klijenti, Pravo, and Nacrti i dokumenti. Pickers exist for case overview, case work, case activity, client overview, a colleague's schedule, draft a tužba, set a deadline, and analyze a document. Cases and clients are searched on the server, colleagues are filtered locally ignoring diacritics, and documents are searched by title (non-archived, with a file). The picked record goes into the prompt as an exact reference: case number, client number, full name, or `doc:<id>`. A picked case is only named; the conversation is not linked to it. The document picker can instead fall back to attaching a new file. Portir's practice rule accepts short office read queries (tasks, deadlines, hearings, agenda, cases, clients, documents, activity) as legal requests.
- When a session is linked to a case (brief apply, manual link, or an approved `link_case` proposal), and when files are uploaded to a session that is already linked, each chat attachment is filed as a workspace document on that case and its client (`ChatAttachment.documentId`, idempotency key `chat-attachment:<id>`). Text already extracted in chat is copied to the document version. The `DOCUMENT_CREATED` activity row has `metadata.source = "CHAT_ATTACHMENT"`. Filing is best effort: a failure (for example a file type the document store rejects) never blocks the link and is retried on the next link or upload.
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
  - Drafting requests also go to the agent. Its `draft_lawsuit` tool runs the Mastra `lawsuit-drafting` workflow:
    - It builds the brief from the conversation's client messages and the session's attachments, reusing extracted text.
    - It then grounds and drafts the lawsuit.
    - Results are saved through the usual `brief-extraction` and `drafting` jobs, so the Case-work and Draft review panels work as before.
  - `revise_draft` creates a new draft version from a chat instruction (for example "skrati obrazloženje"). `get_draft` and `list_conversation_drafts` read the conversation's drafts, which the agent also sees in its context.
  - A turn that produced a draft is marked `DRAFT_READY`. Every draft still needs lawyer approval in the review panel.
  - "Request changes" in the draft review panel queues a `drafting` job that the same Mastra `draft-revision` workflow runs; the new version is announced with "Nacrt je spreman za pregled." Retrying a failed `brief-extraction` or `drafting` job reruns it from its stored input. Older queued `answering` jobs run as agent turns.
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

- The deterministic Financials backend bills **work entries** (`WorkEntry`, see "Work capture and retainers"), not tasks, events, or deadlines. `Task`, `Event`, and `Deadline` no longer carry a `statementId`, and the eligible-work endpoint is gone; completing a task/event/deadline instead creates a `PROPOSED` entry, which the user confirms with minutes. Only `CONFIRMED` entries with minutes that belong to the statement's client and are not yet linked to a line can be billed. The former candidate-review and standalone statement-line creation workflow has been removed.
- Billing statement lines are required children of a statement and cannot exist independently. Statements store invoice creation, maturity, and turnover dates; place of issue, payment method, comment, cash-bill number, country; explicit net, VAT-rate, VAT-amount, and gross totals; `printWorkSpecification` (default true; the print view appends a work-specification table of date, performer, description, and duration); and `billingMonth` for month-end drafts. Each line stores its own net amount, VAT rate, VAT amount, gross amount, `minutes`, and a `pricingRequired` flag. Creating or editing a draft statement transactionally claims the selected entries (`workEntryIds`) with a status check (`CONFIRMED`, same client, no line yet), sets them `BILLED`, and links them to the line through `WorkEntry.statementLineId`; a concurrent claim fails with a conflict instead of double-billing. Lines flagged `pricingRequired` (typically `AT` work awaiting a tariff price) have no amount until a lawyer enters one, and **a statement with any such line cannot be sent**. Removing a line, deleting a draft, or voiding a statement releases its entries: timed entries return to `CONFIRMED`, entries without minutes to `PROPOSED`, and `statementLineId` is cleared. Sent and voided statements cannot be deleted. Sending a statement marks its lines billed. All lines in one statement belong to its client.
- Finance access is restricted in the service layer: `OWNER`/`ADMIN` manage office-wide financials, `LAWYER` can record and view permitted own work, and ordinary `MEMBER` accounts do not receive unrestricted finance access.
- The workflow does not issue tax/fiscal invoices, calculate tariffs or tax, process or record payments, create automatic charges, or call AI. Statements may retain an external invoice reference, but the platform has no payment records or derived paid/outstanding status. A typed future proposal contract exists without a model/provider implementation.
- **Unbilled work (Neobračunat rad, `/finance/work-review`):** lists `CONFIRMED` work entries that no statement bills yet, filterable by client (multiple), case, person, treatment, and date range. Selecting entries of one client (mixing clients is refused) opens a new statement with those entries preloaded (`?clientId=&workEntryIds=`); a row can also start a statement on its own. Entries that are no longer confirmed, no longer unbilled, or belong to another client are skipped and the composer says so.
- **Statement composer:** the statement list, detail page, and shared create/edit draft composer work against work entries. Successful saves open the statement detail, whose print action opens a dedicated shell-free A4 invoice view with statement, client, line, VAT, total, comment, and payment information plus browser printing. Workspace issuer and bank-profile settings are not yet persisted, so the print view keeps their temporary placeholders together behind an explicit replacement TODO. The composer captures all invoice dates, issue/payment metadata, comment, country, cash-bill reference, the `printWorkSpecification` checkbox (default on), and per-line net/VAT/gross values. Row net, VAT-rate, VAT-amount, and gross edits recalculate their dependent values immediately without event loops; statement net, VAT-amount, and gross totals are derived from the rows, while the statement VAT rate remains user-controlled. "Uvezi neobračunat rad" opens a modal listing the confirmed unbilled entries of the statement's client (case filter, paged, already-added entries marked); each imported entry becomes one line carrying `workEntryIds`, `minutes`, and the description "{opis} ({h} h {m} min)". An `HOURLY` entry is priced as minutes/60 times the client's billing-profile hourly rate (half-up to 2 decimals, integer arithmetic) when that rate is in the statement currency; every other entry gets a zero amount with `pricingRequired`. Flagged rows show a "Cena nije uneta" badge and may stay at zero; entering a positive amount on a row clears its flag, while an unflagged row still needs a positive amount. Manual lines remain possible. Changing the client during new-statement composition preserves row values but detaches the old work entries from their rows (they become manual lines). Draft rows expose edit and confirmed-delete actions; deletion is enforced server-side as draft-only. Currency entry and filtering use one ordered supported-currency list, retain ISO codes in API values, and display localized currency names.
- **Sending and the work specification:** the statement detail page shows a "Pošalji" button for drafts, after confirmation. It is disabled with an explanatory tooltip and notice while any line is `pricingRequired` (the API enforces the same rule with a 409 "Price every line before sending"), and flagged lines carry the same badge there. When `printWorkSpecification` is on and the statement has entry-backed lines, the print view appends a "Specifikacija rada" table (Datum, Izvršilac, Opis, Trajanje) of every line's work entries sorted by date, with a total duration row; with the flag off, or with only manual lines, nothing is appended.
- **Month-end page (`/finance/month-end`, OWNER only; route guard and sidebar entry both hide it from every other role):** a month picker (default: the previous month) drives step 1, a precheck table per client of the month's `PROPOSED` and `CONFIRMED`+`UNDECIDED` entries with inline "Potvrdi" (opens the capture dialog; a confirmed entry without treatment is edited instead) and "Otpiši" (write-off dialog with a mandatory reason), reloading the check after each action. Step 2, "Generiši nacrte", is enabled once the check has loaded; when open entries remain it first asks for confirmation (open entries are not included in the drafts). The result table lists every row the run returns, with an "Otvori obračun" link when a statement id is present, the outcome (created, updated, or "Bez promena" when nothing was added), lines added, and lines still to price. The run is idempotent, so repeating it only adds new confirmed work.
- Financial filters use searchable content-width comboboxes where supported: Unbilled work accepts multiple clients, people, and treatments plus a single case, and the statement list accepts multiple clients over its loaded result set. Price-source client agreements use a searchable single-client combobox because each price source stores one `clientId`.

## Work capture and retainers

The Angular screens for quick capture, the header timer, review, My/Team time, billing settings, Retainers, Unbilled work, entry-based statements, and the month-end run, and the Profitability page are implemented. AI is optional: every flow below works without it.

### Work entries and statuses

- A `WorkEntry` is the single billable unit: performer (`userId`), `clientId` (required), optional `caseId` (must belong to the client), `workDate`, `minutes` (1 to 1440), Serbian Latin description, optional `ServiceCategory`, `treatment`, `status`, and a `source`. All reads and writes are scoped by `workspaceId`; mutations write activity-log rows.
- Statuses: `RUNNING` (timer, no minutes yet), `PROPOSED` (needs a decision; minutes may be empty), `CONFIRMED` (minutes required, ready to bill), `BILLED` (linked to a statement line; immutable), `WRITTEN_OFF` (a reason is required). A user has at most one `RUNNING` entry, enforced by a partial unique index.
- Treatments: `RETAINER`, `AT`, `HOURLY`, `NON_BILLABLE`, `UNDECIDED`.
- Permissions: users create and change their own non-billed entries. `OWNER`/`ADMIN` see and change everyone's and are the only ones who may delete a written-off entry. A `LAWYER` also reads entries on cases where they are a current responsible user. A `MEMBER` sees only their own. Billed entries cannot be edited, written off, or deleted.
- Endpoints (`work-entries`): list, get, create (`CONFIRMED`), update, confirm, write-off, delete, timer (get/start/stop), `from-source`, and `parse`.

### Sources

- `MANUAL` and `QUICK_CAPTURE`: created `CONFIRMED` with minutes. `QUICK_CAPTURE` entries set `aiParsed` when the form was prefilled by AI.
- `TIMER`: start on a client (and optional case), stop to set minutes as elapsed time rounded up to the next minute (capped at 1440). Stopping leaves the entry `RUNNING` with minutes for the user to confirm.
- `TASK`, `EVENT`, `DEADLINE`: completing a task (`DONE`), event (`COMPLETED`), or deadline (`SATISFIED`) creates one `PROPOSED` entry for the performer (assignee, organizer, or responsible user), with minutes taken from the event duration when it is not all-day. Work that does not resolve to exactly one client (from the record's client and its case's client) creates no entry. `sourceType`/`sourceId` are unique per workspace, so re-completing never creates a second entry and reopening never deletes it. `POST work-entries/from-source` confirms the entry with minutes.
- `ACTIVITY`: logging a `PHONE_CALL`, `MEETING`, or `EMAIL` client/case activity creates a linked entry (`CLIENT_ACTIVITY`/`CASE_ACTIVITY`); with `durationMinutes` it is `CONFIRMED`, otherwise `PROPOSED`. The activity row itself stays the journal and stores no duration.
- The `EMAIL` source value exists in the database enum for the later Outlook connector but nothing produces it yet.

### Default treatment from retainers

- A client may have several `RetainerAgreement`s (non-overlapping in time) with monthly fee, currency, validity range, optional included minutes (no value means no cap), covered `ServiceCategory` list (empty means everything), and separate overage and out-of-scope rules (`HOURLY`, `AT`, or `ABSORBED`; `HOURLY` requires a rate).
- A new entry's treatment defaults from the agreement active on `workDate`: a covered category (or an agreement with no category list) gives `RETAINER`; otherwise the out-of-scope rule (`HOURLY`, `AT`, or `RETAINER` when `ABSORBED`); with no agreement it is `UNDECIDED`. The user can override it.
- `ClientBillingProfile` (hourly rate and currency per client) prices `HOURLY` entries for clients without a retainer. `UserRate` (internal hourly value, effective from a date, in the workspace `internalCurrency`) and `WorkspaceConfig.targetHourlyRate` feed profitability only. Categories, retainers, profiles, and rates are managed through `billing-setup` endpoints by `OWNER`/`ADMIN`. Workspaces are seeded with seven service categories (_Korporativno savetovanje_, _Pregled ugovora_, _Izrada ugovora_, _Medijsko pravo_, _Parnica_, _Upravni postupak_, _Ostalo_).

### AI free-text capture (never writes)

- `POST work-entries/parse` sends one sentence to a synchronous structured `ChatModelProvider` call (OpenRouter through the Mastra model layer, 10 second timeout) and returns suggested client, case, minutes, category, and description. It writes nothing; the user still presses Save.
- Client and case matching reuses the diacritic-insensitive matching helpers. An ambiguous name leaves the field empty and returns up to five candidates. A missing API key, timeout, or invalid model output returns `ok: false` with empty fields, so the form keeps working manually.

### Timer and review notifications

- The hourly reminder runner sends `TIMER_RUNNING_LONG` to the performer when a timer has run longer than four hours or crossed local midnight (deduped per entry and start time).
- `TIME_REVIEW_REMINDER` is a weekday nudge sent once per local date at or after the user's configured time, only for users who enabled the review reminder in their settings (default off).

### Retainer usage and 80/100% alerts

- Usage per client and month reports covered (`RETAINER`) minutes against the included minutes, out-of-scope minutes, and the effective hourly rate (fee divided by hours). `OWNER`/`ADMIN` see every client; a `LAWYER` sees only clients they are responsible for. A mid-month start or end prorates the cap by days, rounded down to whole minutes.
- After an entry is confirmed, covered minutes reaching 80% or 100% of the prorated cap send `RETAINER_USAGE_80` or `RETAINER_USAGE_100` to the client's responsible user (the workspace owners when none is set), deduped per agreement, month, and level. Uncapped agreements never alert.

### Month-end billing run (owner only)

- `billing/month-end/:month/precheck` lists, per client, entries still `PROPOSED` or `UNDECIDED` in the month so nothing silently falls out. `billing/month-end/:month/run` creates draft statements; only the `OWNER` may call either.
- One draft per client and currency (with `billingMonth` set). Lines in order: retainer fee ("Paušal za {mesec} {godina}", prorated by days for a mid-month start or end), overage above the included minutes in chronological order priced by `overageRule` (`ABSORBED` adds no line but still marks the entries billed against the fee), out-of-scope work grouped by case (or category when there is no case) priced by `outOfScopeRule`, non-retainer `HOURLY` work priced from the client's billing profile, and `AT` work as lines with an empty amount and `pricingRequired`. Missing rates also produce `pricingRequired` lines instead of guessed prices.
- Idempotent: billed entries are never touched; a re-run adds only new confirmed entries, and joins an existing draft for that client and month instead of creating a second one or charging the fee twice. Entries are claimed inside a transaction with a status check, serialized per client and month, so concurrent runs cannot double-bill. If another run claims the entries first, only that client rolls back. Nothing is sent automatically.

### Profitability report (owner and admin)

- `billing/profitability?from=&to=` returns, per client, revenue (net of `SENT` statements by turnover date; payments are not tracked), internal value of time (minutes times the performer's `UserRate` effective on `workDate`), hours, effective hourly rate against the office target, written-off value, and confirmed-but-unbilled value, sorted by effective rate ascending. Entries whose performer has no rate count their hours but contribute no value and are reported as unknown rather than guessed. The report also carries a per-person breakdown of logged versus billed minutes; other roles get a forbidden error.
- The Angular page `reports/profitability` (card on Reports, `OWNER`/`ADMIN` route guard) shows last month by default, this month, last 3 months (Europe/Belgrade calendar) or a custom range, a worst-first client table and a person tab (logged versus billed hours, utilization). A rate below the office target is shown in the destructive color (exact decimal comparison); rows note "nije uporedivo" and the hours whose value is unknown.

### Demo data

- `npm run db:seed:demo` seeds the service categories, a user rate per demo user (partner 9000, lawyer 6000, trainee and staff 2500 RSD), a 7000 RSD office target, a capped retainer (20 h, 120 000 RSD, `HOURLY` overage 6000, out-of-scope `AT`), an uncapped `ABSORBED` retainer (60 000 RSD), an EUR 120 hourly profile, and about 40 September 2026 entries covering every status and source. The seed is idempotent.

## Partial or not finished yet

These areas have routes or backend groundwork but should not be described as completed end-to-end business workflows:

- **Client detail tabs:** the client detail page declares documents, activities, and financials tabs, but the inspected component primarily loads overview data and related cases. These tabs need their own complete UI/data workflows before they can be counted as finished.
- **Documents UI, finance, reports, notifications, and dashboard:** the documents **backend** is implemented; the web documents route/component is still a placeholder. Financials has implemented billing-review and statement-management surfaces but remains in progress as an overall product area. Reports, notifications, and dashboard completion should be assessed separately from the implemented client, case, calendar, assistant, and document-API workflows. A route alone is not evidence that the underlying business logic is finished.
- **Automated backend coverage:** no feature-specific backend `*.spec.ts` files were found under `libs/api/features` during this review. The backend behavior is implemented, but regression coverage is currently stronger on the assistant frontend than on the backend domain services; the new work-view frontend logic has focused unit tests, but the corresponding backend query extensions do not yet have dedicated spec tests.
- **Board “Load more”:** pagination is tracked per record type (Task/Deadline/Event), not per rendered board column, so a column fed by more than one record type can require more than one “Load more” action to reveal further items of a specific type.
- **Calendar List/Board filter persistence:** Calendar’s List/Board presentation deliberately does not sync its own filter state into the URL (to avoid overwriting the calendar’s `view`/`date` query parameters), so those filters reset on a full page reload, unlike the dedicated Team work/My work pages.

## Main conclusion

The strongest completed product slices are authentication, client management, case management, calendar/events, assistant/chat/drafting, and the unified work-tracking experience (Team work, My work, Calendar List/Board, and Case → Work). The work-management backend now supports paginated, multi-value, and free-text-searchable task/deadline/event queries, contextual filtering, due-target forms, transitions, validation, workspace isolation, and activity logging, all consumed through one shared frontend component instead of duplicated screens. Client detail integration, focused backend tests, and per-column board pagination remain outstanding.
