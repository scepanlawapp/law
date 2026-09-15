# Decisions

## 1. Use the legal-domain spec as the migration authority

The repository instructions and the target domain specification prioritize the legal-domain model for `Party`, `Client`, `Matter`, `Proceeding`, and `Document`. The existing Client/Case schema is treated as the migration source rather than the desired final state.

## 2. Prefer additive migration stages

The project guidance favors expand-and-contract schema changes. This means new legal-domain tables and compatibility layers should be created before any legacy logic is retired.

## 3. Preserve current tenant boundaries

The current auth and workspace access logic already enforces multi-tenancy. All migration and compatibility work must keep those constraints, with no trust in browser-supplied tenant IDs.

## 4. Keep ambiguous proceeding mapping nullable

If a current field does not clearly map to a real legal proceeding, it should remain ambiguous and nullable instead of being guessed into the wrong entity model.

## 5. Keep current client/case contracts during the initial migration stage

The repo’s current contract and UI layers are strongly tied to `Client` and `Case`. A compatibility layer is preferable to a risky full-scope cutover in a single step.
