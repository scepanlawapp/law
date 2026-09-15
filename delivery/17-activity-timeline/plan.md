# Phase 17 — Activity events and timeline

## Overview

This phase introduces backend-generated activity events and the corresponding client-side timeline experience. The implementation should reuse the repo’s existing tenant-audit/event pattern instead of inventing a separate event system, while keeping payloads minimal, tenant-scoped, and business-focused.

No blocking questions.

## Repository findings relevant to this phase

- The repo already has a tenant-level audit table in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma): `TenantAuditEvent` stores `userId`, `workspaceId`, `eventType`, `outcome`, `requestId`, `metadata`, and `createdAt`.
- The current chat service already records audit events through a repository-native pattern in [libs/api/features/chat/src/lib/chat.service.ts](../../libs/api/features/chat/src/lib/chat.service.ts), which is a useful precedent for lightweight event storage that is backend-owned and not client-authored.
- The legal-domain specification for activity events is in [docs/legal-domain/11-activity-audit (1).md](../../docs/legal-domain/11-activity-audit%20(1).md), with tenancy rules in [docs/legal-domain/09-security-tenancy (1).md](../../docs/legal-domain/09-security-tenancy%20(1).md) and UX guidance in [docs/legal-domain/07-frontend-ux (1).md](../../docs/legal-domain/07-frontend-ux%20(1).md).
- The current repo already exposes `ClientActivity` and `CaseActivity` models in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma), which are useful precedent for human-readable activity records but are not the same as a generalized business timeline system.
- The Client and Case detail screens already render tabs and lists of activity items in [apps/web/src/app/features/clients/client-detail.component.ts](../../apps/web/src/app/features/clients/client-detail.component.ts) and [apps/web/src/app/features/cases/case-detail.component.ts](../../apps/web/src/app/features/cases/case-detail.component.ts). This is the likely UI entry point for a timeline view.

## Scope

### In scope

- Reuse the existing audit/event infrastructure where it matches the legal-domain semantics.
- Add or align a backend activity-event model or repository-equivalent event store for meaningful business actions.
- Record the minimum initial events for Client, Matter, MatterClient, participant, proceeding, and document actions.
- Ensure event creation is reliable relative to the business transaction and tenant context.
- Expose activity/timeline retrieval APIs for Client and Matter entities.
- Render a chronological timeline in the frontend with readable human-facing labels.
- Add tests proving events are created and remain tenant scoped.

### Out of scope

- Building a full event-bus infrastructure beyond what the repo already uses.
- Storing raw sensitive identifiers or full snapshots unnecessarily.
- Broad feature redesign outside the timeline and audit-related flows.
- Fabricating activity content in the frontend instead of relying on backend-created event records.

## Expected files and modules to change

Likely impact points:

- [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma)
- [libs/api/core](../../libs/api/core) and the tenant/audit conventions already used by the repository
- new or existing activity/event modules under [libs/api/features](../../libs/api/features)
- client and matter service files for event creation when key domain actions occur
- shared API interfaces or DTO contracts if timeline data is exposed to the frontend
- frontend timeline screens/components or sections in the Client/Matter detail tabs under [apps/web/src/app/features](../../apps/web/src/app/features)

## Database and migration impact

- This phase may require a schema addition if the repo does not yet have a dedicated business activity/event model for the legal-domain timeline.
- Additive migration is required: preserve the existing `TenantAuditEvent`, `ClientActivity`, and `CaseActivity` data while introducing a dedicated domain event model or a repository-equivalent event table.
- The event table should be workspace-scoped and should not store unnecessary full snapshots or secret data.
- Include verification queries for tenant-bound event retrieval and ordering.

## API and contract impact

Expected API behavior:

- backend-created events remain the source of truth;
- client and matter detail APIs should expose a chronology list or timeline response;
- event payloads should be minimal structured JSON with readable values such as status transitions or link targets;
- the API must filter by the current workspace/tenant and not leak cross-tenant events.

## Frontend impact

- The timeline should be chronological and human-readable.
- It should be attached to the Client or Matter detail screen’s Activity tab or section.
- The UI should render event labels and timestamps without inventing data or statuses locally.
- Any event type mapping should be a rendering concern, not a source of truth.

## Compatibility and data-safety risks

- The repo already has `ClientActivity` and `CaseActivity` flows, but these are not necessarily the right abstraction for a generalized legal timeline.
- If a new activity model is introduced, it must still respect workspace scoping and minimal payload semantics.
- Cross-tenant events must not be visible; this is both a backend and API contract concern.
- Event creation must be reliable with the business transaction to avoid partial timeline histories.

## Test and verification strategy

Add or update tests for:

1. event creation on matter/client lifecycle actions;
2. participant, proceeding, and document link actions emit meaningful records;
3. tenant-scoped retrieval does not reveal other workspace events;
4. timeline ordering is chronological and human-readable;
5. event payloads remain minimal and do not include unnecessary sensitive data.

Verification after implementation:

- run the targeted API/Jest tests for the new activity-event behavior and tenant scoping;
- run the relevant frontend tests if the UI adds a timeline component or refines the activity tab;
- record exact commands and outcomes in [delivery/17-activity-timeline/verification.md](./verification.md).

## Decisions requiring approval

- Reuse the repository’s existing `TenantAuditEvent` pattern as the starting point rather than creating a separate event system unless the repo semantics require a different model.
- Keep the first version focused on the minimum legal-domain actions needed for client and matter timeline reliability.
- Keep timeline payloads minimal and business-useful, not full object dumps or sensitive details.

## Completion gate

This phase is complete when the timeline reflects real backend business actions and is not fabricated by the frontend.
