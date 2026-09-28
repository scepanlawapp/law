# Specification

## Problem

Task, event, and deadline dialogs do not consistently let a user choose the responsible person and related case. New task and deadline dialogs fall back to the first returned workspace member instead of the signed-in user, while the event dialog exposes neither field.

Work review currently derives candidates from completed events, completed tasks, satisfied deadlines, and activity records within a default 90-day range. The required candidate set is every task and event that is not already linked to a billing statement line.

## Requirements

- Let users choose an optional case when creating or editing a task, event, or deadline.
- Let users choose the responsible person for each of those records.
- Default the responsible person to the signed-in user only for new records.
- Preserve existing responsible-person and case values when editing.
- Return work-review candidates from tasks and events whose `billingStatementLineId` is null.
- Do not include deadlines, case activities, or client activities as candidates.
- Keep workspace, role, client, case, source, review-resolution, and pagination behavior intact.
