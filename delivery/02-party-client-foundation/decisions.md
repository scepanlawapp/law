# Decisions

## 1. Keep legacy Client data in place

The repository instructions and migration safety rules require preserving existing data and using an expand-and-contract path. This phase therefore keeps the current `Client` model in place and adds the Party-based foundation adjacent to it instead of replacing it immediately.

## 2. Follow the repository’s existing lookup pattern

The repo already uses a narrow `references` pattern with `ReferenceDto`, `WorkspaceAccess`, and tenant-scoped queries. That makes it the most consistent foundation for the new lookup family rather than building a separate lookup subsystem.

## 3. Treat `Client` as a firm relationship attached to a `Party`

The legal-domain specification defines `Client` as the firm’s relationship with a party, not as the identity record itself. The new model should reflect that distinction and leave the current legacy structure readable while the new model is introduced.

## 4. Keep contact-person relationships configurable and tenant-safe

Organization contact persons should be modeled as separate `Party` PERSON records connected by `PartyRelationship`, with the relationship type being lookup-driven and workspace-scoped.

## 5. Delay large backfills until validation exists

The repo’s migration guidance and the legal-domain spec both require preserving data first and only backfilling when the new schema has been validated. This phase therefore avoids migrating legacy client records until a later, safe implementation step.
