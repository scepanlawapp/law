# Draft Approval Gate

- **Track ID:** `draft_approval_gate_20260909`
- **Type:** Feature
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

The draft approval gate is implemented and pushed in commit `6c37c90` on `feature/draft_approval_gate_20260910`. It includes the approval state model, Prisma migration, audit events, revision-job regeneration with reviewer feedback, lawyer-only review routes, the dedicated Angular review panel, warnings/missing-field display, Latin/Cyrillic switching, translations, and focused tests.
