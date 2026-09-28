# Case Create Breadcrumb Specification

## Problem

The routed case form has no breadcrumb, so users creating a case lack the same visible navigation context available on case detail pages.

## Included

- Add a semantic breadcrumb to the case create and edit form.
- Link the parent breadcrumb to the sanitized return URL when supplied, falling back to the Cases list.
- Show the current create or edit page as the breadcrumb's current item.
- Reuse existing case translation keys and visual conventions.

## Excluded

- Changes to case form fields, submission behavior, routing, or backend APIs.
