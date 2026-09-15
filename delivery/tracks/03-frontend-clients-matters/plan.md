# Phase 03: Frontend Clients and Matters

## Objective

Replace placeholder Client and Case screens with API-connected Angular Client and Matter workflows using the Phase 02 legal contracts and routes.

## Implemented slice

- Added legal `LegalClientsApiClient` and `MattersApiClient` wrappers while preserving legacy wrappers.
- Replaced placeholder Client and Case list pages with server-side search, pagination, loading, empty, retry, and error states.
- Added routed Client create form for Person and Organization core identity fields and notes.
- Added routed Matter create form with title, priority, description, Save Draft, and Open Matter actions.
- Added routed Client and Matter detail views with API loading, overview, tabs, client/contact/participant/proceeding summaries, and honest Documents/Activity empty states.
- Reused standalone Angular components, Signals, typed Reactive Forms, existing localization pipe, toast service, Router, Spartan button/input/field/table primitives, semantic tokens, and modern control flow.

## Deferred slice

- Participant/role and Proceeding backend prerequisite endpoints remain to be added before management controls can become fully interactive.
- Repeatable contact point, identifier, address, organization-contact, Matter-client, lookup, participant, and proceeding editors remain follow-up work.
- Inline lookup creation remains follow-up work.
- Full API e2e/manual responsive verification remains follow-up work.
- Documents and Activity persistence remain Phase 04.
