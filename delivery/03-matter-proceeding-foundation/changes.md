# Changes

## Backend

- Added the first Matter/Proceeding schema foundation in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- Added a minimal Matter service foundation and app wiring to begin an additive legal-domain aggregation layer.
- Extended the repository’s lookup pattern to include Matter-related reference types.

## Database

- Added new Prisma models for Matter, MatterClient, MatterParticipant, MatterParticipantRole, Proceeding, MatterStage, ParticipantRole, and ProceedingType.
- Added migration-ready SQL for the new tables and indexes.

## Tests

- Added a focused Matter service spec covering the DRAFT-to-OPEN validation rule and tenant-scoped access behavior.

## Notes

- This remains a compatibility-first implementation and does not rewrite the legacy Client/Case runtime.
