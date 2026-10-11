# Plan

- [x] Create branch, track files and delivery index entry.
- [x] Persist client referring lawyer with contracts, validation and migration.
- [x] Add client form/detail field and rename company settings navigation.
- [x] Add finance version pagination and detail APIs.
- [x] Build finance version table, creation dialog and read-only details with breadcrumb.
- [x] Run targeted validation and update implemented-behavior documentation.

- [x] Default the referring lawyer to the signed-in user on creation, preserving edit values and late-response user choices.

## Validation

- Web targeted Jest suites: 50 tests passed (client form/detail, revenue editor and version list/details).
- API targeted Jest suites: 53 tests passed (clients, revenue service and HTTP).
- Nx API build and web development build passed; Angular `ngc --noEmit` passed. Web build required running outside the sandbox after sandboxed processes exited without diagnostics.
- Changed-file lint and `git diff --check` passed. Full `nx lint web` remains blocked by three existing errors in `matter-link.component.ts`, `invoice-line-import-dialog.component.html`, and `infinite-scroll.directive.ts`, plus an existing non-null assertion warning in client details.
- Additive referring-lawyer migration applied to local development database.
- Browser reached the login page; authenticated keyboard, modal scrolling, responsive and theme interaction checks were not performed.

- Follow-up default validation: 20 client-form tests passed, including signed-in default, edit null preservation, and delayed-auth selection/clear preservation. Changed-file ESLint and diff checks passed.
