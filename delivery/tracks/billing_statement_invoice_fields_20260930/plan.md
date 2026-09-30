# Billing Statement Invoice Fields Plan

- [x] Create the implementation branch and register the delivery track before application changes.
- [x] Add and verify the Prisma migration, schema changes, and demo seed updates.
- [x] Update shared contracts, request DTO validation, finance persistence, mappings, and totals.
- [x] Update focused backend fixtures and tests for the renamed and added values.
- [x] Extend the typed Angular create/edit form and payload mapping with all invoice and line fields.
- [x] Update list/detail rendering and Serbian/English translations for the new terminology.
- [x] Update implemented-business documentation.
- [x] Run focused formatting, Prisma validation/generation, lint, type checking, tests, and builds.
- [x] Record verification results and mark this track complete.

## Verification

- `npx prisma format --schema apps/api/prisma/schema.prisma` (passed).
- `npx prisma validate --schema apps/api/prisma/schema.prisma` (passed).
- `npx prisma generate --schema apps/api/prisma/schema.prisma` (passed).
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` (passed).
- `npx tsc -p apps/api/tsconfig.app.json --noEmit` (passed).
- Focused ESLint on changed finance TypeScript files (passed with no errors; seven existing `no-explicit-any` warnings remain in `financials.service.ts`).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts --output-style=static` (7 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (5 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build api --configuration=development --output-style=static` (passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static --verbose` (passed outside the sandbox, including Angular template compilation).
- JSON parsing for both translation catalogs and delivery metadata (passed).
- `git diff --check` (passed).
