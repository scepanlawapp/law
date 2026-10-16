# Frontend Shared Pagination State

## What

One generic, signal-based pagination state for the Angular web app, living in `apps/web/src/app/shared/pagination`, used by every paginated screen:

- `PageState` — page, page size, total items, page count, loading, page/size change rules and last-page clamping. Used directly when a screen owns its own request (combined endpoints, board/table views).
- `PaginatedList<T>` (`injectPaginatedList`) — `PageState` plus a `fetch` function: items, error, loaded, stale-response cancellation, clamping to the last page, retry, append mode (load more / infinite scroll) and URL-driven mode (`navigate`).
- `LocalPagination<T>` — client-side slicing of an in-memory list.
- `law-pagination` takes a single `[paginator]` input instead of separate page/size/total/disabled bindings.

## Why

Every list re-implemented the same signals, sequence counters, clamping and page-size rules. A single implementation makes defaults (page size 50, sizes 10/20/50/100) and behavior easy to change in one place.

## Scope

- Page-button lists: clients, cases list (URL), case detail (activities, responsibilities, assistant sessions/drafts), documents, finance invoices (local), invoice-line import dialog, payments, past events, team/my time, work view table.
- Append lists: finance work review (infinite scroll), event and task work entries (load more).
- Out of scope: option lookups (`page: 1, pageSize: 100`), my-time fetch-all, dashboard counters, assistant sidebar sessions (list is mutated by chat flows), work-view board columns.

## Acceptance

- No behavior change for users: same defaults, clamping, reset-on-filter, stale-response handling.
- Focused web tests, lint and type-check pass.
