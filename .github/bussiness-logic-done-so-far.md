# Business Logic Done So Far

**Checked:** 2026-09-21  
**Scope:** `apps/api`, `apps/web`, shared API contracts and API clients.

This document describes behavior that is currently implemented in code and wired into the application. It does not treat a route, translation key, or empty component as a finished workflow.

## Backend foundation

- The API is an Nx/NestJS application composed from feature modules for authentication, chat, clients, cases, references, user settings, activities/tasks/deadlines, legal knowledge, and workspace documents.
- Prisma is used for persistence through the shared platform database service.
- Workspace-aware endpoints use authentication, CSRF/origin protection, and workspace membership checks. Domain services validate that referenced cases, clients, client contacts, deadlines, and active workspace users belong to the current workspace.
- API responses use shared contracts from `libs/api/api-interfaces` and paginated response metadata where list endpoints support pagination.
- Domain mutations create activity-log entries for the activities/tasks/deadlines workflow and for document create/update/version/archive/restore, preserving the acting user and workspace context.

## Legal knowledge retrieval

- PostgreSQL `pgvector` is the sole vector-store direction; the former unused vector-store/template stubs are removed.
- Versioned public legal sources and workspace-scoped sources are persisted with content hashes, parser metadata, Serbian source-script metadata, and article/paragraph chunk metadata.
- The first source adapter fetches and validates Paragraf Lex's `Zakon o radu` page. `npm run legal:ingest -- --dry-run` reports the normalized chunk set without embedding or database writes; real ingestion uses BGE-M3 (1024 dimensions) through the server-side OpenRouter embeddings endpoint.
- `POST /api/legal-knowledge/search` performs authenticated, workspace-filtered cosine search and returns source/article citation metadata with each result.
- The `drafting` workflow retrieves matching `Zakon o radu` chunks per `BriefResult` field (legal basis entries, factual description, claim summary), above a minimum similarity threshold, and instructs the drafting LLM to cite them inline with `[n]` markers; only markers the model actually used are persisted as `DraftCitation` rows (article, source, snippet, score) and returned on `DraftResultResponse.citations`.
- The `answering` workflow performs the same single-query retrieval against the user's message and persists any `[n]` markers actually referenced as denormalized citations on `ChatMessage.metadata`, returned as `ChatMessageResponse.citations`.
- The assistant frontend renders `[n]` markers in assistant chat replies as jump links and shows a compact "Izvori" (Sources) list under grounded messages; the draft review panel shows the same citations in a collapsible "Izvori" section (article/source/snippet/match/source link).
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
- Case activities: list, create, and update.
- Case responsibilities: list, add, update, end, and set a primary responsible user.
- Case/client relationship validation is enforced in the backend.
- The frontend includes case list, case creation/edit form, case detail, lifecycle controls, activities, responsibilities, confirmation dialogs, and save/error feedback.

## Workspace documents (backend)

Authenticated document APIs are implemented. The Angular documents library (list, archive, download) is still a placeholder; a reusable upload modal is implemented.

- `POST /api/documents` uploads one streamed file (`multipart` field `file`) with title and optional `caseIds`/`clientIds`. `Idempotency-Key` is required.
- Paginated list (`archived` defaults to active-only; `true`/`false`/`all`), detail, metadata/link patch (arrays replace when present), version upload/list, current and historical download, archive, and restore.
- Bytes live under `FILE_STORAGE_ROOT` with generated keys. Metadata and the recorded storage connection stay in PostgreSQL. Chat uploads are not moved.
- Linked cases and clients must belong to the workspace (400 when unavailable). Archive hides from the default list; authorized detail and download still work.
- There is no virus-scanning claim, no cloud adapter, and no permanent delete in this slice.

## Workspace documents (upload modal)

- Documents, client detail, and case detail can open a reusable upload dialog against `POST /api/documents`.
- Each selected file is its own document. Title is required (max 320). Case/client links are locked on those detail pages and searchable on the documents page.
- Upload uses XHR progress (`withXhr()`), concurrency 2, and a frozen `Idempotency-Key` on retry. Optional per-row category codes are stored on `Document.category`. Clients are selected before cases; case search is constrained by selected clients. Version-mode queue exists; there is no version UI entry in this slice.
- Removing a row only drops it from the local queue. It does not archive or delete a stored document.

## Calendar, events, tasks, deadlines, and notes API

The backend implementation in `libs/api/features/activities-tasks-deadlines` is substantially complete as a domain API:

### Events

- List, create, read, and update events.
- Event filtering by type, status (single or multiple), case, client, and user (single or multiple, matching organizer or assignee).
- Event completion and cancellation transitions.
- Event validation ensures the end time is after the start time.
- Events can reference cases, clients, workspace assignees, and client contacts as attendees.
- Event creation/update trims user-entered text and records activity-log entries.

### Tasks

- List, create, read, and update tasks.
- Filtering by status (single or multiple), priority, assignee (single or multiple), case, client, deadline, free-text search (title/description), and a due-date range.
- Tasks support either a due date or a due timestamp, never both.
- Task completion, cancellation, and reopening transitions.
- Tasks can be associated with cases, clients, and deadlines.

### Deadlines

- List, create, read, and update deadlines.
- Filtering by status (single or multiple), type, responsible user (single or multiple), case, client, free-text search (title/description), and a due-date range.
- Deadline validation requires exactly one due target: due date or due timestamp.
- Deadline satisfaction, cancellation, and reopening transitions.
- API responses calculate whether an open deadline is overdue.
- Deadlines support responsible users, case/client associations, time zones, and source descriptions.

### Notes and calendar aggregation

- List, create, read, and update notes.
- Notes can be associated with cases, clients, or events.
- Calendar aggregation returns events, tasks, and deadlines for a date range with filters for user (single or multiple), client, case, source type (single or multiple), status (single or multiple), a flag to include tasks/deadlines with no due date, cursor, and limit.
- Calendar items include the full assignee list for events (not just the organizer), so multi-assignee events can be attributed correctly.
- Activity-log listing is available with case and client filters.
- Free-text search and multi-value person/status filters were previously accepted by these endpoints but silently ignored; they are now actually applied server-side.

## Calendar frontend

The calendar is the finished frontend surface for the event/calendar portion of the work-management API:

- Month, week, and agenda views, plus List and Board presentations (see the shared work view below) selectable alongside them without disturbing the grid views' rendering or date math.
- Date navigation and “today” navigation.
- Search and source filtering for events, tasks, and deadlines.
- Lawyer/user filtering through workspace references.
- Calendar loading, error, and incomplete-range states.
- Multi-day event segmentation and overlap layout in the week view.
- Event detail popovers/menu actions and event create/edit dialog.
- Event form validation, including end-after-start validation, and API-backed create/update operations.
- Calendar state is represented with Angular signals and uses the shared API clients.

## Team work, My work, and the shared work view

The former Tasks & Deadlines page has been replaced by a single reusable `WorkView` component (List and Board presentations) reused across four contexts — Team work, My work, Calendar, and Case → Work:

- Routes: `/work/team` (Team work, full filter toolbar) and `/work/my` (My work, current-user work only, no team filter toolbar). The former `/tasks-deadlines` URL redirects to Team work, preserving query parameters. Sidebar navigation exposes both as separate entries.
- Record types (Tasks, Events, Deadlines) are combined into one unified item list/board; the record-type filter selects one or several.
- List view shows title, record type, status, owner/assignee, due date or event time, related case/client, and an overdue indicator.
- Board view groups items into To do / In progress / Done columns using a presentation-only mapping (Task `IN_PROGRESS` is the only source of the In-progress column, since Events and Deadlines have no in-progress state); Cancelled items are only shown through an explicit open/history switch, never mixed into the active columns.
- Filters: free-text search, record types, people (single or multiple, via a multi-select combobox), statuses (single or multiple), case, and a date preset (all dates / overdue / today / upcoming). My work hides the team filter toolbar and keeps the current user fixed; Case → Work keeps the case fixed. Neither fixed constraint can be cleared by switching presentation, changing filters, or resetting.
- Pagination is server-driven per record type with an explicit “Load more” action; no page of results is presented as a complete list or board.
- Item actions reuse the existing Task/Deadline/Event dialogs and transition endpoints (create, edit, complete/cancel/reopen for tasks and deadlines; complete/cancel for events, which have no reopen). Board also supports drag-and-drop between columns, restricted to the same backend-supported transitions as the action buttons — a drop with no corresponding transition (for example, dragging a cancelled item, or dragging an event back out of Completed/Cancelled) is rejected rather than silently allowed.
- "My work" is defined per entity by existing domain relationships (task assignee, deadline responsible user, event organizer-or-assignee), not by who created the record.

## Cases: Work tab

The case detail page has an additional Work tab, alongside the existing Overview/Cases/Activities/Responsibilities tabs, rendering the same shared `WorkView` component with the case fixed. Creating a task, deadline, or event from this tab prefills the case. The existing activities/responsibilities tabs and their API calls are unchanged.

## Dashboard

The dashboard is a real, API-backed landing page (previously an empty placeholder), composed from a dashboard-scoped facade (`DashboardStore`) and reusable presentation components rather than one large component:

- A greeting (authenticated user's name with a safe fallback) and an assistant prompt box that hands the entered text to the existing assistant page once, via a one-time query parameter the assistant consumes and immediately strips from the URL — no second chat implementation and no auto-sent/duplicated messages.
- Four summary cards (active cases workspace-wide, upcoming hearings for the current user in the next 7 days, pending tasks assigned to the current user including tasks without due dates, and a documents count marked explicitly unavailable since document counting is not implemented). Counts use bounded queries (`pageSize: 1` reads against each existing list endpoint's authoritative `meta.totalItems`), never the length of a fetched page.
- An Upcoming obligations panel built on the existing calendar aggregation endpoint (deduplicated, unfinished Task/Deadline/Event items for the current user in the next 7 days), with a separate overdue count/link into My work so overdue items remain visible outside the 7-day window, and item selection opens the existing Task/Deadline/Event dialogs.
- A Recent activity panel built on the existing ActivityLog endpoint, reusing the same action-label mapping as the Team/My work views.
- A Notifications panel and a Total documents stat explicitly render "not available yet" placeholders rather than fabricated content, since neither notifications delivery nor document management is implemented.
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

## References and user settings

documents,

- Workspace reference data, including users, is available to frontend forms and display components.
- User settings can be read and updated through authenticated API endpoints.
- The frontend has profile, appearance, workspace, and data settings pages.
- Conversation history can be cleared for the current user and workspace, using a confirmation dialog and success/error feedback.

## Frontend infrastructure currently in use

- Standalone Angular components with signal-based state in the implemented feature areas.
- Reactive forms for clients, cases, events, assistant composition, and settings actions.
- Shared API-client services for authentication, chat, clients, cases, references, settings, calendar, events, tasks, deadlines, notes, and activity logs.
- Authenticated application layout and routes for dashboard, clients, cases, documents, calendar, notifications, finance, reports, Team work (`/work/team`), My work (`/work/my`), settings, and assistant.
- Shared localization pipe/service, loading spinners, empty states, confirmation dialogs, toast feedback, and Spartan/UI components are used across the completed screens.

## Partial or not finished yet

These areas have routes or backend groundwork but should not be described as completed end-to-end business workflows:

- **Client detail tabs:** the client detail page declares documents, activities, and financials tabs, but the inspected component primarily loads overview data and related cases. These tabs need their own complete UI/data workflows before they can be counted as finished.
- **Documents UI, finance, reports, notifications, and dashboard:** the documents **backend** is implemented; the web documents route/component is still a placeholder. Finance, reports, notifications, and dashboard completion should be assessed separately from the implemented client, case, calendar, assistant, and document-API workflows. A route alone is not evidence that the underlying business logic is finished.
- **Automated backend coverage:** no feature-specific backend `*.spec.ts` files were found under `libs/api/features` during this review. The backend behavior is implemented, but regression coverage is currently stronger on the assistant frontend than on the backend domain services; the new work-view frontend logic has focused unit tests, but the corresponding backend query extensions do not yet have dedicated spec tests.
- **Reusable notes lists and client activity history integration:** notes and the ActivityLog remain read/history endpoints; they are not surfaced as their own reusable list component or integrated into client activity history yet.
- **Board “Load more”:** pagination is tracked per record type (Task/Deadline/Event), not per rendered board column, so a column fed by more than one record type can require more than one “Load more” action to reveal further items of a specific type.
- **Calendar List/Board filter persistence:** Calendar’s List/Board presentation deliberately does not sync its own filter state into the URL (to avoid overwriting the calendar’s `view`/`date` query parameters), so those filters reset on a full page reload, unlike the dedicated Team work/My work pages.

## Main conclusion

The strongest completed product slices are authentication, client management, case management, calendar/events, assistant/chat/drafting, and the unified work-tracking experience (Team work, My work, Calendar List/Board, and Case → Work). The work-management backend now supports paginated, multi-value, and free-text-searchable task/deadline/event queries, contextual filtering, due-target forms, transitions, validation, workspace isolation, and activity logging, all consumed through one shared frontend component instead of duplicated screens. Client detail integration, reusable notes/activity aggregation, focused backend tests, and per-column board pagination remain outstanding.
