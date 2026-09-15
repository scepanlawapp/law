# Migration and Data Safety

## Goal

Replace the early Client/Case model without losing data or requiring a dangerous big-bang migration.

## First rule

Inspect the actual repository and data model before designing concrete migrations.

Do not assume table or column names from this specification.

## Preferred approach

Use an expand-and-contract sequence when practical.

Typical stages:

1. Add new structures.
2. Backfill/migrate existing data.
3. Add new read/write paths.
4. Verify data parity and behavior.
5. Switch runtime traffic to new structures.
6. Keep legacy structures temporarily if rollback is needed.
7. Remove deprecated runtime code only in a later verified phase.
8. Keep historical migration files.

## Existing Client data

Conceptual migration:

```text
existing client identity fields
→ Party

existing client business relationship
→ Client

existing emails/phones
→ PartyContactPoint

existing JMBG/PIB/company number/etc.
→ PartyIdentifier

existing address
→ PartyAddress
```

Do not invent missing data.

## Existing Case data

Conceptual migration:

```text
existing Case
→ Matter

existing Case/Client relationship
→ MatterClient
```

If existing court/proceeding fields clearly represent a formal proceeding:

```text
court number / court / judge
→ Proceeding
```

Do not move ambiguous data silently when meaning cannot be established.

## Required-field changes

Do not fill new required business fields with fake values such as:

```text
UNKNOWN
N/A
TEMP
MIGRATED CLIENT
```

unless the product owner explicitly chooses such a policy.

Instead:

- make migration-stage fields nullable where necessary;
- backfill real values;
- enforce stricter rules at workflow transition/new creation;
- later tighten schema constraints only when safe.

## Verification

Every data migration phase must record verification.

Examples:

- source Client count vs migrated Client count;
- source Case count vs Matter count;
- orphan checks;
- duplicate relationship checks;
- null/invalid reference checks;
- tenant ownership checks;
- spot-check mapping samples.

Use repository/database-appropriate queries and automated tests.

## Rollback

Plan-mode output should identify:

- whether migration is transactional;
- whether down migration is safe;
- whether data is copied or moved;
- what rollback requires after new writes begin.

Do not claim rollback safety without analyzing the concrete migration.
