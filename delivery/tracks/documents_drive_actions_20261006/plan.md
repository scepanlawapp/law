# Plan

- [x] Create index, specification, plan, metadata, and register delivery index.
- [x] Implement and test page-local selection and opening behavior.
- [x] Add workspace-scoped folder rename/move/archive/restore/ZIP download and document move support.
- [x] Implement toolbar, nested destination modal, inline rename, and list/grid parity.
- [x] Cover partial failures, cycle exclusion, rename and archive confirmation.
- [x] Run focused unit tests and non-destructive Chromium checks at desktop/mobile sizes.
- [x] Complete final development builds and scoped lint after formatting.
- [x] Update implemented behavior documentation.
- [ ] Resolve production bundle-budget gate and mark track completed.

## Layout Continuation (2026-10-07)

- [x] Align selection counts/actions with the breadcrumb and constrain the local host/section/content height chain.
- [x] Verify many-row vertical scrolling, reachable final row, fixed controls/pagination, desktop toolbar alignment and mobile geometry/screenshots with mocked Chromium tests.
- [x] Run scoped diagnostics/lint and the development web build; leave the existing production gate open.

Layout verification: all 9 documents-actions Chromium tests pass, including 40-file desktop (1440x960) and mobile (390x844) list/grid overflow checks. The final row/card is reachable; filters, breadcrumb and pagination retain their geometry during content scrolling; mobile horizontal scrolling works; desktop selection actions share the breadcrumb row and align to the content's right edge. Both screenshots inspected. Mocked validation performed no mutations. Changed Angular template/component and browser tests pass scoped ESLint without warnings; editor diagnostics and `git diff --check` are clean. `nx build web --configuration=development --outputStyle=static` passes (Nx cache hit). Production build was not rerun; the prior 2.15 MB / 1.75 MB gate remains unresolved. No shell/backend/action changes, branch creation or commits.

## Verification

- API: 40 tests across document/folder service suites, including real ZIP streaming, workspace isolation, cycle rejection and upload/archive race protection.
- Web: 15 document state tests covering modifier/range selection, keyboard opening, partial bulk failure, confirmation cancellation, rename pending/error/save/cancel and destination exclusions.
- Chromium: 7 mocked-API browser checks pass. Includes nested/root moves, association isolation, folder download routing, list/grid selection, rename keyboard/error behavior, archive/restore, and mobile file details. Screenshots inspected at 1440x960 and 390x844. No live document mutations.
- Database: migration `20261006120000_document_folder_archive` applied locally; Prisma client regenerated. No seeding performed.
- Final gates: `nx build web --configuration=development` and `nx build api` pass. Scoped ESLint passes using the web and web-e2e project configurations for Angular templates and browser tests; backend/contracts/client lint and `git diff --check` pass. Final unit rerun: 15 web + 40 API tests pass. Final browser run: 7 Chromium tests pass.
- Production Angular build attempt: compilation reached bundle validation but failed at 2.15 MB versus the existing 1.75 MB initial-bundle limit. No budget/configuration change made. Track remains in progress for this unresolved gate.
- Branch: stayed on `main`; controlling session instructions prohibit creating a branch without explicit authorization, despite the repository track-branch convention.
- Dependency installation reported 75 workspace audit advisories. Unrelated dependency remediation was not attempted.
- Scoped GitHub Security Advisories scan of `archiver@7.0.1` and its resolved dependency graph found no known CVEs. Existing unrelated workspace advisories remain outside this track.
- Independent review reran the 15 document interaction unit tests successfully and checked Google Drive's official organize/download guidance for the selection and destination workflow.
