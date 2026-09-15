# Changes

## Shared contracts

- Added `legal-contracts.ts` with Party, Client, Matter, Proceeding, lookup, autocomplete, relationship, and lifecycle contract shapes.
- Re-exported legal contracts through `api-interfaces.ts`.
- Preserved legacy Case/Client contract exports.

## Backend APIs

- Added `libs/api/features/clients` with DTOs, service, controller, module, tenant-scoped Client/Party workflows, organization contact creation/linking, and Client search.
- Added `libs/api/features/cases` Matter DTOs, service, controller, module, tenant-scoped Matter workflows, filtering, search, and lifecycle transitions.
- Extended `libs/api/features/references` with legal lookup CRUD/deactivation and User autocomplete.
- Registered Clients and Matters modules in `apps/api/src/app/app.module.ts`.

## Verification

- API build, API tests, shared contract build, and whitespace checks passed.
