# Case Detail Filters and Pagination Specification

## Problem

Case-detail tabs currently load fixed or complete arrays without navigation. Activities cannot be filtered by multiple types or searched by keyword, the document tab does not expose its existing search capability, and assistant case links are silently capped. The document-upload dialog may also dismiss when the backdrop is clicked.

## Scope

- Add paginated case-activity queries with multi-value activity types and keyword search over title and description.
- Paginate case responsibilities and assistant-linked sessions/drafts through their APIs.
- Add accessible filter controls and pagination controls to the Activities, Documents, Responsibilities, and Assistant tabs.
- Use the existing server-side document search and pagination contract.
- Explicitly disable outside-pointer dismissal for the document-upload dialog.
- Add Serbian and English localization for the new controls and status text.

## Acceptance criteria

- Activity filters apply before pagination and support any selected activity types plus a case-insensitive keyword.
- Each requested tab exposes working previous/next controls backed by response metadata.
- Changing a filter resets its tab to page one and does not filter only the currently visible page.
- Empty states distinguish an empty filtered result through the visible filter context.
- Clicking outside the document-upload modal does not close it.
