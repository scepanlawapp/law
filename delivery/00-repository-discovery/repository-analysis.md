# Repository analysis and gap map

## 1. Repository baseline

### Monorepo and workload layout

- The repo is an Nx monorepo for a legal practice management application.
- Primary app entrypoints are [apps/api](../../apps/api) and [apps/web](../../apps/web).
- Shared contracts live under [libs/api/api-interfaces](../../libs/api/api-interfaces).
- Backend and frontend stacks are already aligned with NestJS, Prisma, Angular, TypeScript, Jest, and Playwright.

### Backend stack

- NestJS 11 is used for the API layer.
- Prisma is the database ORM with `prisma` and tenant-specific client generation.
- Current migration commands are configured in [package.json](../../package.json).
- Core tenant/workspace access enforcement lives in [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts).

### Frontend stack

- Angular 22 with standalone components and reactive forms is the frontend baseline.
- Feature screens are organized by domain folders.
- The UI currently reflects the `Client` and `Case` domain rather than the target `Party`, `Matter`, and `Proceeding` model.

## 2. Current data model summary

### Existing tenant schema shape

The current tenant schema in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma) includes:

- `Client`
- `ClientAddress`
- `ClientContact`
- `Case`
- `CaseResponsibility`
- `CaseActivity`
- `Tag`, `CaseType`, `PracticeArea`
- `ClientTag`, `CaseTag`
- `ChatSession`, `ChatAttachment`, `DraftResult`, and related models

This confirms the repository is still in a Client/Case implementation stage.

### Core business meaning

The data model principles in [docs/legal-domain/README (2).md](<../../docs/legal-domain/README%20(2).md>) define:

- `Party` as a person or organization
- `Client` as the firm’s client relationship with a `Party`
- `Matter` as the internal firm workspace
- `Proceeding` as a concrete legal proceeding within a matter
- `Document` as a physical document stored once and reused across linked entities

The current repository does not yet reflect this legally specific semantic layer.

## 3. Current backend contracts and services

### Client API

- Controller: [libs/api/features/clients/src/lib/clients.controller.ts](../../libs/api/features/clients/src/lib/clients.controller.ts)
- Service: [libs/api/features/clients/src/lib/clients.service.ts](../../libs/api/features/clients/src/lib/clients.service.ts)
- DTOs: [libs/api/features/clients/src/lib/clients.dto.ts](../../libs/api/features/clients/src/lib/clients.dto.ts)
- Existing endpoints include list, get, create, update, archive, activate, addresses, contacts, activities, and related case associations.

### Case API

- Controller: [libs/api/features/cases/src/lib/cases.controller.ts](../../libs/api/features/cases/src/lib/cases.controller.ts)
- Service: [libs/api/features/cases/src/lib/cases.service.ts](../../libs/api/features/cases/src/lib/cases.service.ts)
- DTOs: [libs/api/features/cases/src/lib/cases.dto.ts](../../libs/api/features/cases/src/lib/cases.dto.ts)
- Existing endpoints include state transitions (`activate`, `close`, `reopen`, `archive`), activities, and responsibilities.

### Shared API contracts

- [libs/api/api-interfaces/src/lib/api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts) exposes the shared contract set for `Client*` and `Case*` objects.
- This is the primary contract dependency for both backend and frontend.

## 4. Authorization and tenant isolation

The repository already has the right authorization architecture around a tenant-aware workspace boundary:

- [libs/api/core/src/lib/workspace-access.guard.ts](../../libs/api/core/src/lib/workspace-access.guard.ts)
- [libs/api/core/src/lib/tenant-context.interceptor.ts](../../libs/api/core/src/lib/tenant-context.interceptor.ts)
- [libs/shared/frontend/security/src/lib/security.ts](../../libs/shared/frontend/security/src/lib/security.ts)

The legal-domain work must preserve these protections and should not introduce new trust in browser-supplied tenant identifiers.

## 5. Frontend feature footprint

### Clients UI

- [apps/web/src/app/features/clients/client-form.component.ts](../../apps/web/src/app/features/clients/client-form.component.ts)
- [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts)
- [apps/web/src/app/features/clients/clients.component.ts](../../apps/web/src/app/features/clients/clients.component.ts)

### Case UI

- [apps/web/src/app/features/cases/case-form.component.ts](../../apps/web/src/app/features/cases/case-form.component.ts)
- [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts)
- [apps/web/src/app/features/cases/cases.component.ts](../../apps/web/src/app/features/cases/cases.component.ts)

These screens already reflect the current client/case domain and likely need staged migration or adapter patterns when the legal-domain model becomes central.

## 6. Lookup and reference patterns

The established pattern is a workspace-scoped reference model:

- [libs/api/features/references/src/lib/references.controller.ts](../../libs/api/features/references/src/lib/references.controller.ts)
- `Tag`, `CaseType`, `PracticeArea` are configured in the tenant schema and exposed through admin CRUD endpoints.

This matches the domain guidance for configurable lookup data and should be reused for matter/proceeding/custom lookup patterns rather than hard-coded enums.

## 7. Current migration risk profile

### Risk areas

- A significant semantic shift is required from `Client/Case` to `Party/Matter/Proceeding`.
- The current schema and shared API types are not aligned with the target legal-domain specification.
- There are multiple existing IDs, relationships, and UI assumptions keyed to current client/case entities.
- Document storage and linkage are not yet represented as the target domain architecture expects.

### Safe migration strategy coming next

- Keep the current schema readable while introducing new legal-domain primitives.
- Prefer additive tables and compatibility reads/writes.
- Verify tenant ownership and `workspaceId` constraints on every migrated linkage.
- Add migration verification tests for important data transformations.

## 8. Gap analysis against the legal-domain specification

The legal-domain specification is more specific than the current implementation in several areas:

| Area           | Current repo state                  | Legal-domain target                                          |
| -------------- | ----------------------------------- | ------------------------------------------------------------ |
| Entity model   | Client/Case                         | Party, Client, Matter, Proceeding                            |
| Relationships  | Client-to-case, contacts, addresses | Party relationships, matter participants, proceeding linkage |
| Document model | Limited chat attachments            | Single physical document with multiple links                 |
| Custom data    | `customFields: Json?`               | Typed custom fields with domain-specific definitions         |
| Lookup data    | Tag/CaseType/PracticeArea           | Configurable legal lookups, legal domain values              |
| History/audit  | Some activity structures            | More explicit business-history conventions                   |

## 9. Why this matters for the next implementation phase

The current repository has the correct architectural foundations—Nx, NestJS, Prisma, Angular, tenant context, and auth enforcement—but the domain model still needs to catch up to the specification. This means the safest path is not a broad rewrite. Instead, the next implementation should be a staged, additive migration aligned with the legal-domain guidance and repository standards.

## 10. Completion note

This discovery phase was intentionally limited to repository analysis. No production code or schema changes were made.
