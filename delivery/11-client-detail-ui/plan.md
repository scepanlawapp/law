# Phase 11 — Client detail screen

## Overview

This phase refactors the Client detail experience around the current legal-domain model: a Client is a firm relationship around a Party, with organization contact persons, contact points, identifiers, addresses, and linked matters/documents/activity. The existing repo already has a Client detail component and a corresponding Client API, so the goal is to tighten the UI around that contract rather than inventing a second client domain or a new data model.

No blocking questions.

## Repository findings relevant to this phase

- The current Client detail screen already exists in [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts) and [apps/web/src/app/features/clients/client-detail.component.html](../../apps/web/src/app/features/clients/client-detail.component.html). It has the core structure for a detail header, tabs, and a few asynchronous sections.
- The Client API contract is already present in [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts), including `get`, `listCases`, `listContacts`, `listAddresses`, `listActivities`, and archive/activate actions.
- The domain model specification in [docs/legal-domain/03-party-client (1).md](<../../docs/legal-domain/03-party-client%20(1).md>) clarifies that `Party` holds identity/contact data and that organization contact persons are separate `Party` records with a relationship layer rather than stored as flat client fields.
- The frontend UX specification in [docs/legal-domain/07-frontend-ux (1).md](<../../docs/legal-domain/07-frontend-ux%20(1).md>) calls for concise detail headers, tabs, overview sections, and explicit empty/loading/error states.
- The document model in [docs/legal-domain/05-documents (1).md](<../../docs/legal-domain/05-documents%20(1).md>) confirms that documents can be linked without duplicating stored files, which matters for the Client detail page’s documents section and aggregation behavior.

## Scope

### In scope

- Build a compact detail header with display name, client code, Party type, status, edit action, and organization primary contact when available.
- Implement tabs for Overview, Contact persons, Matters, Documents, and Activity.
- Refine the Overview section to show core info, contact details, identifiers, addresses, primary contact, active matters summary, notes, and recent activity when available.
- Implement the Contact persons tab around relationship, job title, primary status, email, and phone.
- Implement the Matters tab with Active/Closed/All filter support and links to Matter detail when available.
- Keep Documents and Activity sections basic and safe when those backend phases have not yet shipped; do not create mock persistence.
- Add responsive, loading, empty, and error states to async sections.
- Add targeted frontend tests for the detail screen’s display and state behaviors.

### Out of scope

- Rewriting the Client domain model or adding a new parallel Party system.
- Full editing flows for contact persons, identifiers, or addresses inside this phase unless already implemented elsewhere.
- Broad document management or activity backend implementation beyond the client detail page’s UI expectations.
- Destructive migration or legacy runtime replacement.

## Expected files and modules to change

- [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts)
- [apps/web/src/app/features/clients/client-detail.component.html](../../apps/web/src/app/features/clients/client-detail.component.html)
- [libs/shared/frontend/api-clients/src/lib/api-clients.ts](../../libs/shared/frontend/api-clients/src/lib/api-clients.ts) only if the detail page needs a missing typed endpoint or response shape for the UI contract.
- Any relative shared UI helper used for empty/loading/error states if the screen needs a small local pattern.
- Focused tests under the web app for the detail component’s loading and display logic.

## Database and migration impact

- No database migration is expected for this phase.
- This work should remain read-focused and compatibility-safe: the existing Customer/Client data model remains intact while the UI aligns with the new Party/Client identity model.
- The implementation must not assume contact persons are stored as flat fields on the Client itself; it should rely on the relationship structure already modeled in the domain specification.

## API and contract impact

- The detail screen should use the existing `ClientsApiClient` methods and typed response contracts already in the repo.
- If the UI needs fields not yet present in the current `ClientDetail` contract (for example, identifiers, short addresses, organization primary contact metadata), the contract should be extended in the smallest possible additive way and only if it is already supported server-side.
- The backend remains authoritative for tenant, archive, and status rules.

## Frontend impact

- The detail page should stay compact and readable: a detail header plus tabbed sections instead of a giant edit form.
- The overview should align with the legal-domain model rather than legacy flat-client fields.
- Use the existing tabs and button patterns already present in the repo, preserving the current style system and route interactions.
- Use concise empty states: “No contact persons”, “No matters”, “No recent activity”, etc., rather than blank content.

## Compatibility and data-safety risks

- The main risk is that the detail page continues to reflect the old flat Client model instead of the new Party-based identity/contact model.
- Another risk is showing document/activity data from a backend phase that is not fully implemented; that should be handled as a basic placeholder only when the underlying API contract truly does not exist.
- The page must not expose cross-tenant data or archived records in a way that bypasses the backend authorization rules.
- If a specific field is not available from the API, do not invent placeholder business data for the user-facing UI.

## Test and verification strategy

1. Add focused tests for the detail component’s initial loading state and loaded-state rendering.
2. Add tests for empty states and error states for the asynchronous sections.
3. Test the archive/activate action wiring and the tab content loading behavior where the current API contract supports it.
4. Run the smallest relevant Nx/Jest web test target and record the exact output in the delivery verification artifact.

## Decisions requiring approval

- Whether the page should show a `Documents` tab as a live document list or a minimal empty-state/placeholder until backend document linking is complete.
- Whether the `Matters` tab is intended to show all matters or only active matters by default.
- Whether the organization primary contact should be rendered as a dedicated chip or as part of the header summary.

## Completion gate

This phase is complete when the Client detail page clearly exposes the new identity/contact model, keeps the view compact, and avoids becoming a giant edit form while still supporting the key read-only workflows for contact, matters, and activity.
