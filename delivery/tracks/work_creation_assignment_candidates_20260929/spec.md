# Specification

## Problem

Task, event, and deadline dialogs do not consistently let a user choose the responsible person and related case. New task and deadline dialogs fall back to the first returned workspace member instead of the signed-in user, while the event dialog exposes neither field.

Work review currently derives candidates from completed events, completed tasks, satisfied deadlines, and activity records within a default 90-day range. The required candidate set is every task and event that is not already linked to a billing statement line.

## Requirements

- Let users choose an optional case when creating or editing a task, event, or deadline.
- Let users choose an optional client when creating or editing a task or deadline.
- Let users choose the responsible person for each of those records.
- Default the responsible person to the signed-in user only for new records.
- Preserve existing responsible-person, client, and case values when editing.
- Return work-review candidates from tasks and events whose `billingStatementLineId` is null.
- Do not include deadlines, case activities, or client activities as candidates.
- Keep workspace, role, client, case, source, review-resolution, and pagination behavior intact.

## Follow-up requirements

- Candidates without a client remain visible but cannot be selected in bulk.
- Explain disabled candidate selection with a tooltip and accessible description.
- Select-all skips candidates without a client and reflects only selectable rows.
- Emphasize the missing client in the table with a warning icon and instruction.
- A row billing action for a candidate without a client first opens a client-selection dialog, persists that client on the source task/event, then continues into the billing-line dialog.
- Remove the finance overview, client statement, and client balance pages from the frontend, including their routes, navigation, and frontend-only API methods.
- Keep billing statement backend persistence and endpoints intact because billing lines still reference statement lifecycle data and deletion would require a destructive data migration.
- Split price sources into three tabs: client agreements, state/public sources, and company catalog.
- Client agreements must always belong to a client; state/public and company catalog sources are workspace-wide.
