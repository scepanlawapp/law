# Relation Autocomplete Filters Specification

## Problem

Client, case, and workspace-user choices are inconsistent across work and finance screens. Several high-cardinality entity fields use non-searchable selects, while list filters that can accept multiple values do not consistently offer multi-selection.

## Included

- Use searchable single-selection comboboxes for task relations and every other singular relation in the existing data model.
- Use searchable multi-selection comboboxes for event clients, while every responsible-person form field remains single-selection. The event request continues to send the selected responsible person through its assignee array contract.
- Use searchable multi-selection comboboxes for calendar, work-view, finance work-review, statements, and price-source filters where the list API accepts arrays.
- Hide the work-view person filter when the view is already scoped to the current user.
- Use content-width overlays for all changed comboboxes, retaining the shared bounded maximum width.
- Preserve relation IDs in request payloads and translated/user-friendly display labels.
- Add focused verification and update implemented-business documentation.

## Excluded

- Changing Prisma relation cardinality or adding new many-to-many relations.
- Expanding list APIs solely to support a new multi-value filter; unsupported filters remain unchanged and are reported.
- Changing non-entity selects such as status, priority, type, currency, or date mode.
