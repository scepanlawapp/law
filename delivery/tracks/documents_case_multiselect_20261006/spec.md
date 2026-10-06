# Documents Case Multi-Select Specification

## Problem

The Documents workspace can filter by only one case at a time. Users need to select multiple cases and see documents linked to any selected case.

## Included

- Replace the single-case filter with an accessible checkbox multi-select.
- Include all selected case IDs in the paginated document-list request.
- Match documents linked to any selected case while preserving all other filters.
- Keep the existing singular `caseId` query parameter compatible.
- Include selected cases in empty-state filter detection and clear-filter behavior.

## Excluded

- Case search, changes to case option loading, or cross-page selection semantics.
- Changes to document linking, folder navigation, or other filters.
