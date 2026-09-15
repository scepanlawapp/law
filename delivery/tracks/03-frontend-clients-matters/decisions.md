# Decisions

## Legal API wrappers beside legacy wrappers

The frontend adds legal API-client classes beside the legacy `ClientsApiClient` and `CasesApiClient`. This avoids breaking unrelated consumers while the new screens migrate to `/matters` and `Legal*` contracts.

## Honest Phase 04 states

Documents and Activity tabs render explicit unavailable/empty states because their persistence/API layer is not implemented yet. The frontend does not invent local or fake persistence.

## Route compatibility

Existing `/clients` and `/cases` routes remain. New create/detail routes are nested under those paths for the current navigation compatibility; Matter terminology is represented in the screen behavior and backend API.

## Form scope

The first form slice covers required core identity and Matter fields. Repeating child collections and inline lookup creation remain separate slices so each can be tested against the corresponding backend endpoints.
