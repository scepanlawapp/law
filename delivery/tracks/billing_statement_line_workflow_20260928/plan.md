# Billing Statement Line Workflow Plan

- [x] Create the implementation branch and register the delivery track before application changes.
- [x] Replace billing-entry Prisma models with standalone statement-line fields, lifecycle, and source relations.
- [x] Add a migration and update demo seed data.
- [x] Replace billing-entry contracts, DTOs, services, and controllers with statement-line behavior.
- [x] Update statement assembly, editing, sending, voiding, balances, and overview calculations.
- [x] Redesign the modal around shared client and row-level description, amount, and currency.
- [x] Show totals grouped by currency and preserve removable selected rows.
- [x] Update work-review and statement consumers to use statement lines.
- [x] Add focused backend tests and remove the obsolete frontend date-helper test.
- [x] Update business documentation and complete verification.
- [x] Complete the delivery track.

## Verification

- `npx prisma format --schema apps/api/prisma/schema.prisma`
- `npx prisma validate --schema apps/api/prisma/schema.prisma`
- `npm run prisma:generate`
- `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`
- `npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts`
- `npx nx build api`
- `npx nx build web`
- Targeted ESLint and Prettier checks for changed financial files.
- Workspace-wide lint was also run; it remains blocked by pre-existing unrelated errors in `api-clients` dependency metadata and existing web components/templates.
