# Invoice Domain Rename Plan

- [x] Create and register the `invoice_domain_rename_20261004` delivery track with the completed invoice UI work as context.
- [x] Rename Prisma models, enums, relations, and source-reference fields; add a data-preserving SQL migration.
- [x] Rename shared API contracts, Nest DTOs/controllers/services, seed helpers, and backend tests.
- [x] Rename Angular routes, feature files, symbols, API-client methods, form helpers, and frontend tests.
- [x] Rename English and Serbian localization keys while preserving their user-facing invoice text.
- [x] Update the implemented-business documentation and verify active code no longer uses billing-statement vocabulary.
- [x] Run Prisma validation/generation and targeted backend/frontend tests and builds.
- [x] Mark this plan complete and set metadata status to `completed` after verification.

## Verification

- `npx prisma format --schema apps/api/prisma/schema.prisma`
- `npx prisma validate --schema apps/api/prisma/schema.prisma`
- `npm run prisma:generate`
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts --output-style=static` (7 tests passed)
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx test web --runInBand --testPathPatterns=invoice-form.spec.ts --output-style=static` (10 tests passed)
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build api --output-style=static`
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false CI=true npx nx run web:build:development --skip-nx-cache --output-style=static`
- Changed TypeScript sources pass ESLint with seven existing `no-explicit-any` warnings in `financials.service.ts` and no errors.
- English and Serbian locale key sets match; referenced finance keys exist in both files and neither file contains duplicate keys.
- Workspace-wide lint remains blocked by pre-existing errors in `libs/shared/frontend/api-clients/package.json`, `matter-link.component.ts`, and `sidebar.component.html`.
- The local database migration was not applied during verification because the local PostgreSQL/Docker service was unavailable; the Prisma schema itself validates and the generated client and builds succeed.
