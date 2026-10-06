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
