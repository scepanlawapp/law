# Relation display objects specification

## Scope

Replace user-facing relation IDs in response DTOs with shallow display objects for clients, cases, and users across the audited web screens.

## What

- Add shared depth-1 reference DTOs for users, clients, and cases.
- Update response DTOs for cases, documents, calendar, work items, notes, and client responsible users where those relations are displayed.
- Update backend mappers to include and return shallow display objects only.
- Update Angular screens to render relation display objects instead of raw UUIDs.
- Keep IDs in request DTOs, query DTOs, route params, form submissions, and internal identifiers.

## Why

Several web screens currently render raw IDs such as `clientId`, `caseId`, `caseIds[0]`, or `clientIds[0]` because the API response does not include display attributes. Users need names, case numbers, and compact relation labels, while the API should avoid returning deep nested object graphs.

## Non-goals

- Returning nested relation graphs beyond depth 1.
- Changing mutation payloads from IDs to objects.
- Changing route params, filters, or internal identifiers such as `sourceId` and `calendarId`.
- Adding new database columns or Prisma schema relations.
- Reworking unrelated frontend layouts.

## Decisions

- Response relation fields use shallow objects with primitive fields only.
- IDs remain available inside those objects for actions that still need identifiers.
- Requests and filters continue to use IDs.
- Case references do not include nested client objects.
- The first implementation covers all audited raw-ID displays: Documents, Calendar, Case detail/list, Work summaries, Notes where displayed, and client responsible user labels where applicable.
