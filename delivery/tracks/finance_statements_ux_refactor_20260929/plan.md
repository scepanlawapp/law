# Finance Statements UX Refactor Plan

- [x] Create the implementation branch and register the delivery track before application changes.
- [x] Inspect the existing statement components, local Helm APIs, translations, and compact patterns used elsewhere in the application.
- [x] Refactor the statement list hierarchy, filters, table density, and pagination presentation.
- [x] Refactor the statement create page hierarchy, invoice information layout, line editor, warning, total, and actions.
- [x] Refactor the open-line import dialog sizing, header, filters, selection table, pagination, and actions.
- [x] Replace user-visible Serbian statement/invoice terminology contextually with `račun` without renaming code identifiers.
- [x] Verify existing functional behavior through focused tests, lint/type checking, build, and practical UI review where available.
- [x] Mark the track complete and record verification results.

## Verification

- `npx prettier --write` on changed finance templates/components, translations, and track files.
- `npx eslint apps/web/src/app/features/finance-statements/*.ts` (passed).
- `npx tsc -p apps/web/tsconfig.app.json --noEmit` (passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false npx nx test web --runInBand --testPathPatterns=billing-statement-form.spec.ts --output-style=static` (4 tests passed).
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_CLOUD=false npx nx build web --configuration=development --output-style=static` (passed outside the sandbox after sandboxed esbuild deadlocked).
- Browser review against the running local app covered the list, advanced filters, create page, selected-client state, manual line editor, total, import dialog, Serbian copy, and narrow-screen scrolling.
