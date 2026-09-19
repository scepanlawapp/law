# Business Logic Done So Far

**Checked:** 2026-09-18  
**Scope:** `apps/api`, `apps/web`, shared API contracts and API clients.

This document describes behavior that is currently implemented in code and wired into the application. It does not treat a route, translation key, or empty component as a finished workflow.

## Backend foundation

- The API is an Nx/NestJS application composed from feature modules for authentication, chat, clients, cases, references, user settings, and activities/tasks/deadlines.
- Prisma is used for persistence through the shared platform database service.
- Workspace-aware endpoints use authentication, CSRF/origin protection, and workspace membership checks. Domain services validate that referenced cases, clients, client contacts, deadlines, and active workspace users belong to the current workspace.
- API responses use shared contracts from `libs/api/api-interfaces` and paginated response metadata where list endpoints support pagination.
- Domain mutations create activity-log entries for the activities/tasks/deadlines workflow, preserving the acting user and workspace context.

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

## Calendar, events, tasks, deadlines, and notes API

The backend implementation in `libs/api/features/activities-tasks-deadlines` is substantially complete as a domain API:

### Events

- List, create, read, and update events.
- Event filtering by type, status, case, client, and user.
- Event completion and cancellation transitions.
- Event validation ensures the end time is after the start time.
- Events can reference cases, clients, workspace assignees, and client contacts as attendees.
- Event creation/update trims user-entered text and records activity-log entries.

### Tasks

- List, create, read, and update tasks.
- Filtering by status, priority, assignee, case, client, and deadline.
- Tasks support either a due date or a due timestamp, never both.
- Task completion, cancellation, and reopening transitions.
- Tasks can be associated with cases, clients, and deadlines.

### Deadlines

- List, create, read, and update deadlines.
- Filtering by status, type, responsible user, case, and client.
- Deadline validation requires exactly one due target: due date or due timestamp.
- Deadline satisfaction, cancellation, and reopening transitions.
- API responses calculate whether an open deadline is overdue.
- Deadlines support responsible users, case/client associations, time zones, and source descriptions.

### Notes and calendar aggregation

- List, create, read, and update notes.
- Notes can be associated with cases, clients, or events.
- Calendar aggregation returns events, tasks, and deadlines for a date range with filters for user, client, case, source type, status, cursor, and limit.
- Activity-log listing is available with case and client filters.

## Calendar frontend

The calendar is the finished frontend surface for the event/calendar portion of the work-management API:

- Month, week, and agenda views.
- Date navigation and “today” navigation.
- Search and source filtering for events, tasks, and deadlines.
- Lawyer/user filtering through workspace references.
- Calendar loading, error, and incomplete-range states.
- Multi-day event segmentation and overlap layout in the week view.
- Event detail popovers/menu actions and event create/edit dialog.
- Event form validation, including end-after-start validation, and API-backed create/update operations.
- Calendar state is represented with Angular signals and uses the shared API clients.

## Tasks and deadlines frontend

The former Tasks & Deadlines placeholder has been replaced with a working Angular work-management page:

- The existing `/tasks-deadlines` route is preserved.
- Tasks and Deadlines are separate tabs, with Tasks selected by default.
- Selected tab, filters, and pagination are persisted in URL query state.
- Both tabs load results through the existing `WorkManagementApiClient` using server pagination.
- Task filters include search forwarding, status, priority, assignee, case, client, and linked deadline.
- Deadline filters include search forwarding, status, type, responsible user, case, and client.
- “My open” and “All accessible open” quick actions update the real assignee/status filters instead of filtering only the visible page.
- Workspace-user references, case references, and client references are loaded through existing API clients for labels and links.
- Task rows show title, status, priority, due date/time, assignee, related case/client, and explicit actions.
- Deadline rows show title, due date/time, backend-calculated overdue state, type, responsible user, related case/client, status, and explicit actions.
- Date-only values remain date-only, exact timestamps remain date/time values, and missing task due targets display as “No due date”.
- Task actions include create, edit, complete, cancel, reopen, and detail inspection.
- Deadline actions include create, edit, mark satisfied, cancel, reopen, and detail inspection.
- Mutating actions use the existing confirmation dialog, toast feedback, and API transition endpoints.
- Loading, retry, empty, no-results, pagination, and mutation error states are implemented.
- The existing reusable Task and Deadline dialogs are used rather than creating duplicate forms.
- Due-target mode changes clear the inactive date field, preventing both `dueDate` and `dueAt` from being submitted together.
- English and Serbian translations were added for the new page, filters, statuses, actions, and empty/error states.

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

- Workspace reference data, including users, is available to frontend forms and display components.
- User settings can be read and updated through authenticated API endpoints.
- The frontend has profile, appearance, workspace, and data settings pages.
- Conversation history can be cleared for the current user and workspace, using a confirmation dialog and success/error feedback.

## Frontend infrastructure currently in use

- Standalone Angular components with signal-based state in the implemented feature areas.
- Reactive forms for clients, cases, events, assistant composition, and settings actions.
- Shared API-client services for authentication, chat, clients, cases, references, settings, calendar, events, tasks, deadlines, notes, and activity logs.
- Authenticated application layout and routes for dashboard, clients, cases, documents, calendar, notifications, finance, reports, tasks/deadlines, settings, and assistant.
- Shared localization pipe/service, loading spinners, empty states, confirmation dialogs, toast feedback, and Spartan/UI components are used across the completed screens.

## Partial or not finished yet

These areas have routes or backend groundwork but should not be described as completed end-to-end business workflows:

- **Tasks and deadlines extensions:** the main list and transition workflow is implemented, but case/client detail integration, linked-task detail management, reusable notes lists, and client activity history integration are still pending.
- **Client detail tabs:** the client detail page declares documents, activities, and financials tabs, but the inspected component primarily loads overview data and related cases. These tabs need their own complete UI/data workflows before they can be counted as finished.
- **Documents, finance, reports, notifications, and dashboard:** routes/components exist, but their completion level should be assessed separately from the implemented client, case, calendar, and assistant workflows. A route alone is not evidence that the underlying business logic is finished.
- **Automated backend coverage:** no feature-specific backend `*.spec.ts` files were found under `libs/api/features` during this review. The backend behavior is implemented, but regression coverage is currently stronger on the assistant frontend than on the backend domain services.

## Main conclusion

The strongest completed product slices are authentication, client management, case management, calendar/events, assistant/chat/drafting, and the main Tasks & Deadlines workflow. The work-management backend and shared frontend integration now support paginated task/deadline management, contextual filtering, due-target forms, transitions, validation, workspace isolation, and activity logging. Case/client detail integration, notes/activity aggregation, focused frontend tests, and several backend query capabilities remain outstanding.
