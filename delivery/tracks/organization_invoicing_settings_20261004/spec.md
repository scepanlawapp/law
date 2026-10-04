# Organization and Invoicing Settings Specification

## Goal

Introduce a workspace-owned `OrganizationSettings` aggregate alongside the existing general `WorkspaceConfig`. Users can configure company identity, tax defaults, SEF configuration, invoice numbering, payments and bank accounts, currencies, invoice presentation defaults, and SEF attachment preferences without coupling these settings to an individual user or implementing SEF transmission.

## Persistence and security

- One typed organization-settings record per workspace; every read and mutation remains scoped through the current workspace context and `WorkspaceAccessGuard`.
- Bank accounts and invoice sequence state use dedicated workspace-owned records with uniqueness constraints.
- SEF API keys are encrypted at rest, are never returned raw by normal reads, and use dedicated replace/remove operations.
- Unconfigured workspaces load deterministic defaults through the repository's established lazy-bootstrap convention.

## Invoice numbering

- The canonical pattern supports `{YYYY}`, `{YY}`, `{MM}`, `{M}`, `{DD}`, `{D}`, `{SEQ}`, and `{SEQ:n}` with exactly one sequence token.
- `NEVER`, `YEARLY`, and `MONTHLY` reset policies determine the sequence period independently of date tokens in the rendered pattern.
- Suggestions do not reserve values. Successful invoice creation synchronizes matching manual numbers into sequence state without corrupting the counter for nonmatching values.
- Existing invoice uniqueness rules remain authoritative.

## API and UI

- Section-specific endpoints update only the requested organization-settings section; bank accounts use workspace-scoped CRUD/archive operations.
- The existing Workspace settings screen becomes a routed layout with General, Company, Tax, SEF, Numbering, Payments, Currencies, and Invoice defaults tabs.
- Existing general workspace preferences retain their behavior.
- Forms use typed reactive forms, installed Spartan/UI primitives, semantic theme tokens, localized labels, loading/saving/error states, and section-local Save actions.

## Exclusions

- Roles and permissions beyond the existing guards.
- SEF sending, status synchronization, UBL generation, connection testing, or attachment transmission.
- NBS exchange-rate fetching or payment processing.
- Invoice, customer, product/service, contract, purchase-order, or reference redesign.
