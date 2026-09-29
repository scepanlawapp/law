# Finance Statements UX Refactor Specification

## Problem

The existing finance statement workflow is functional, but its list filters, create form, and import dialog are visually oversized and spread too widely. Serbian invoice-facing copy also uses `izvod`, which is misleading in this workflow.

## Included

- Make the statement list compact and table-led, with bounded content width, compact primary/secondary filters, and a single-line pagination footer.
- Recompose the statement create page as a coherent workspace with compact invoice information, line actions, editable lines, total, and footer actions.
- Recompose the open-line import dialog with a wider bounded layout, compact filters, table-led selection, and concise pagination/actions.
- Replace user-visible Serbian invoice terminology with grammatically correct forms of `račun` while preserving existing translation keys.
- Preserve existing routes, component names, TypeScript identifiers, DTOs, form controls, API calls, validation, loading/error states, pagination, selection, and import behavior.
- Use existing installed Helm primitives, semantic theme tokens, localization patterns, and responsive behavior.

## Excluded

- Backend, API, DTO, route, or domain-model renaming.
- Changes to statement creation, billing-line eligibility, currency mismatch, client switching, persistence, or pagination business rules.
- New global navigation/header design, a new component library, or unrelated finance screens.
