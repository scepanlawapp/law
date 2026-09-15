# Verification

## Passed

- `npx prisma validate --schema apps/api/prisma/tenant.prisma`
- `npm run prisma:generate`
- `CI=1 npx nx build api --skip-nx-cache --verbose`
- `npx nx test api --runInBand`
- Local additive migration application with PostgreSQL `ON_ERROR_STOP=1`

## Not run

- No `npx nx test web` or web build was run for Phase 04 because Document/custom-field frontend integration remains deferred.
- No Document upload/download API e2e journey was run.
- No custom-field type/reference tests were added yet.
- No remote tenant or browser verification was run.
- No migration rollback rehearsal was run.
