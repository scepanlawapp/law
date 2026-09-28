# Billing Multi-Candidate Dialog Plan

- [x] Create and register the delivery track before changing application code.
- [x] Add shared batch-create contracts and validated DTOs.
- [x] Add transactional backend creation and proposal-recording behavior with tests.
- [x] Change the dialog context and work-review action to pass all selected candidates.
- [x] Rebuild the modal as shared fields plus a typed item FormArray table.
- [x] Add row removal, conditional duration validation, and localized labels.
- [x] Remove billing-decision and AI suggestion controls from the dialog.
- [x] Update business documentation and verify focused tests, lint, and builds.
- [x] Complete the delivery track.

## Verification

- `npx nx test web --runInBand --testPathPatterns=billing-entry-dialog.utils.spec.ts --skip-nx-cache --output-style=static`
- `npx nx test api --runInBand --testPathPatterns=financials.service.spec.ts --skip-nx-cache --output-style=static`
- `npx eslint` on the changed TypeScript files (no errors; eight pre-existing warnings in `financials.service.ts`)
- `npx nx build api --configuration=development --skip-nx-cache --output-style=static`
- `npx nx build web --configuration=development --skip-nx-cache --output-style=static`
- `git diff --check`
