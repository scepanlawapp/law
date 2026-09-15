# Phase 02: Shared Contracts, Backend APIs, Lookups, and Search

## Objective

Expose the Phase 01 tenant legal domain through shared contracts and tenant-safe NestJS APIs while preserving legacy Case/Client exports for the later Angular migration.

## Implemented scope

- Added modular legal contracts in `libs/api/api-interfaces/src/lib/legal-contracts.ts` and re-exported them through the existing barrel.
- Added guarded Clients/Parties API with person and organization Client creation, detail/list/update/archive/activate, contact-point/identifier/address creation, organization contact-person linking or creation, and Client search.
- Added guarded Matter API with draft creation, list/detail/update, Client filters, Client-name search, year-based `YYYY-NNNNN` allocation on open, open/close/archive transitions, and tenant/reference validation.
- Added configurable lookup list/create/update/deactivate API for all Phase 01 lookup models.
- Added workspace-scoped User autocomplete under references.
- Added focused build/test verification.

## Deferred scope

- Participant and participant-role mutation endpoints.
- Proceeding mutation endpoints.
- General Party management endpoints separate from Client workflows.
- API-client/frontend migration.
- Document, custom-field, ActivityEvent, and UI work.
- Remote tenant/production verification.

## Safety and compatibility

All legal controllers use the existing CSRF, Auth, and WorkspaceAccess guards. Services query through the active tenant context and validate platform User membership through platform Prisma. Legacy Case/Client contracts remain exported for Phase 03 compatibility.
