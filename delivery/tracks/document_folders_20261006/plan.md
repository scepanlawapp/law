# Implementation plan

- [x] Inspect existing document, upload, storage, UI and ownership boundaries.
- [x] Create track index/spec/plan/metadata and register delivery index.
- [x] Add folder schema, migration, seed support, shared contracts and scoped folder APIs.
- [x] Extend normalized candidates and the existing queue/dialog for directory import and drop.
- [x] Add folder navigation, breadcrumbs, backend filters/counts and constrained list/grid UI.
- [x] Add regression coverage; validate/generate Prisma; run web/API checks and fix regressions.
- [x] Update implemented-business documentation and record verification.

## Verification

- Prisma validate and generate passed; the migration SQL ran successfully against PostgreSQL 17 in an isolated schema inside a rolled-back transaction. Checked root sibling uniqueness, hierarchy creation, path constraints and cross-workspace parent/document rejection. No application database migration was applied.
- `NG_BUILD_MAX_WORKERS=2 NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx build web --configuration=development --output-style=static` passed outside the sandbox (sandboxed Angular worker builds exited without diagnostics).
- `NX_DAEMON=false npx nx build api` and `npx tsc --noEmit -p apps/api/tsconfig.app.json` passed.
- `npx jest --config apps/web/jest.config.cts --runInBand --testPathPatterns=features/documents`: 4 suites, 20 tests passed.
- `npx jest --config apps/api/jest.config.cts --runInBand --testPathPatterns='(document-folders|documents).service.spec.ts'`: 2 suites, 29 tests passed.
- ESLint on changed TypeScript files and `git diff --check` passed.
- Headless installed Chrome against the built app with mocked API responses: eight columns, folders before files, complete long-name data, and no table-container horizontal overflow at 1024/1280/1440px. Linked To measured larger than Name at every width. Folder navigation sent the selected folder query and rendered breadcrumbs; grid selection worked; native directory input preserved `Legal/Contracts/contract.pdf`; ensure request targeted the open folder and the subsequent upload carried the resolved folder ID. Upload table had no horizontal overflow at 390px. No browser page errors.
- An Nx web test invocation expanded to the broader suite: 376 passed, 3 unrelated failures in `finance-statement-create.component.spec.ts` because its API mock lacks `suggestInvoiceNumber`. Document tests were rerun directly with the explicit Jest config and all passed.

## Deployment

Apply committed migrations before serving the changed API: `npx prisma migrate deploy --schema apps/api/prisma/schema.prisma`. Generate the Prisma client as part of the usual build. Existing documents remain at root; storage objects and version relations are unchanged. PostgreSQL 15+ is needed for the NULLS NOT DISTINCT uniqueness index (the project's image is PostgreSQL 17).

## Browser limits

Directory picker input uses `webkitdirectory`. Recursive drop uses `webkitGetAsEntry` and drains all reader batches. When directory entries are unavailable, ordinary files still work and unreadable folder drops prompt the folder picker. Empty directories unexposed by the picker are not preserved. Folder preparation/import errors retain the queue for retry.

## Icon and tooltip follow-up

- [x] Increase table type icons by 50% and use bounded, structured tooltip templates.
- [x] Verify Angular compilation and rendered tooltip layout.

Follow-up verification: Angular compiler and web development build passed. Chrome measured both table type icons at 21px (previously 14px), confirmed bounded tooltip width with two separate complete case/client blocks, and no table overflow at 1024/1280/1440px. Name tooltips also wrap without truncation. No browser errors.
