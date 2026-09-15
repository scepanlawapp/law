# Changes

## Backend

- Established the compatibility-first migration plan for the existing `Client`/`Case` runtime and the additive Party/Client and Matter/Proceeding target model.
- Kept implementation scoped to migration safety and verification rather than a destructive rewrite of the active schema.

## Database

- Confirmed that the active runtime remains legacy `Client`/`Case`-centric in [apps/api/prisma/tenant.prisma](../../apps/api/prisma/tenant.prisma).
- Kept the migration path additive and reviewable, matching the repository’s existing direction for tenant-safe expansion.

## Tests

- No new migration logic was executed in the application runtime yet; this phase is currently scoped to the migration plan and verification framework.
- The validated repository signal remains the existing Matter service test suite, which passed in the current checkout.

## Notes

- This phase intentionally avoids destructive cleanup or unverified data rewrites until the migration proof is complete.
