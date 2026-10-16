# Work View Table and Columns

Redesign shared work cards with a two-line truncated title beside a larger archive action, priority below, and an assignee/avatar footer beside a larger Add work action. Do not show status or due timestamps on board cards. Clicking the card or table row opens the task; nested action buttons and status controls keep their independent behavior. Title buttons remain keyboard accessible.

Each board column requests its own status-filtered task pages with page size 100 and an explicit Load more control. Filters and mutations must not allow stale responses to replace current results. Cancelled and archived tasks are table-only, with an alert when selected on the board.

The table uses the same numbered paginator as other pages, below the scrollable table: total items, page numbers, previous/next, and page-size selection (100 by default). Each page replaces rows rather than appending them. Filter and page-size changes reset to page one; retry preserves the requested page, and shrinking server totals clamp to the last valid page. Board pagination stays independent.

Replace list presentation with a semantic table: flexible truncated title, fixed 20rem case and 11rem assignee columns, intrinsic priority/status/action columns. Add work includes its icon and text. Title, case, user, and status fields and their filters do not have tooltips; icon-only actions retain tooltips. Every task can select any status while preserving completion capture and cancellation confirmation. Preserve team, personal, and fixed-case scoping, localization, and semantic themes.
