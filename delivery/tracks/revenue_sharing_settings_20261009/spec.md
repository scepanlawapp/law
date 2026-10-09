# Revenue Sharing Settings

Provide a confidential OWNER/ADMIN configuration module at `/finance/settings`, disabled by default, localized in Serbian Latin and English. Use existing workspace and user identities. Configure firm policies, client-origin work percentages, origination bonuses, effective-dated member agreements, departure policies, and scoped special rules. Preserve all published revisions and agreement periods. Provide a hypothetical simulator and read-only change history.

Percentages distinguish unconfigured, inherited, excluded, and configured values. Modes are presets on one model; lower modes preserve inactive advanced data. Validate precision, dates, identities, overlaps, contradictory rules and exclusive pool limits. Mutations require an expected revision and atomic publication. Historical rate terms cannot be changed; closing an open period and documented departure amendments are recorded in new immutable revisions. Saved collection previews retain work-date rates while resolving later departure amendments as of collection. Future agreement terms can be revised through new snapshots.

No earnings ledger, work/invoice/payment changes, backfill, payouts or production calculation integration. Read-only scope selection uses existing workspace records. Work-entry scope is reserved in the contract; this phase uses the repository's existing Event identities for Work Event scopes and labels this explicitly.

Architecture: dedicated Nest feature, shared DTOs, immutable Prisma configuration revisions with indexed agreement/rule projections, Angular typed forms and Spartan primitives, shared API client, existing localization catalogs. Existing user/membership records are referenced, never duplicated; agreement periods represent engagement applicability.
