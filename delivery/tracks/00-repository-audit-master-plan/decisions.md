# Decisions

## Current checkout is authoritative

**Decision:** Plan from the current repository state and do not restore the removed Client/Case implementation wholesale.

**Reason:** The user confirmed that Client/Case models and implementation were removed before this phase. Historical delivery notes are therefore intent and context, not proof of source availability.

**Consequence:** The legal domain will be designed as a clean Party/Client/Matter foundation, while stale contracts and API clients are reconciled deliberately in later phases.

## Legal-domain specification filenames

**Decision:** Use the recovered legal-domain files with `(1)` and `(2)` suffixes as the specification source and record the path mismatch.

**Reason:** The unsuffixed paths in the prompt are absent, while the suffixed files contain the expected specification documents.

**Consequence:** Filename normalization is a documentation follow-up, not a reason to invent duplicate specifications or ignore the existing content.

## Expand-and-contract migration

**Decision:** Use additive structures, verified backfill, runtime cutover, compatibility retention, and delayed cleanup.

**Reason:** Legal data and tenant isolation require preservation, and current migration history includes a destructive transitional migration that should not be repeated.

**Consequence:** No legacy table or contract is removed until parity, authorization, and runtime-reference verification pass.

## Database-backed lookups

**Decision:** Practice areas, stages, participant roles, proceeding types, document categories, and organization relationship types remain tenant-configurable records.

**Reason:** Firms may need to add or deactivate values without deploying code.

**Consequence:** Only finite program-control values become enums.

## No search engine in the master plan

**Decision:** Begin with PostgreSQL indexes and tenant-scoped search queries.

**Reason:** The domain specification requires database capabilities first and the repository does not currently depend on a search engine.

**Consequence:** A search engine requires measured requirements and explicit approval later.
