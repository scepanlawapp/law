# Plan

- [x] Replace table Load more with shared numbered pagination, server totals, page-size selection, and page reset/retry handling.

- [x] Apply follow-up: double case width, open tasks from card/row surfaces, simplify board metadata, remove field tooltips, and label table Add work.

- [x] Register track and document requirements.
- [x] Implement independent status-filtered board pagination and all-status table transitions.
- [x] Redesign board cards and replace list with localized, accessible table.
- [x] Verify component tests, Angular compilation, and browser layouts/interactions.
- [x] Update implemented-behavior documentation and complete track.

Verification: 36 work-view tests pass; Angular `ngc --noEmit` and scoped TypeScript ESLint pass. Initial fixture-backed Playwright verified desktop (1440px) and mobile (390px), independent TODO page 2, all five status options, terminal-status notice, and contained horizontal scrolling. Follow-up browser checks confirm the 320px case column, labeled Add work, task opening from card/row surfaces, independent status controls, and board cards without status/date. Title/case/user/status tooltips were removed by request. Authenticated live persistence was not tested. Nx reported a cache-database warning after the passing tests; compilation and lint ran separately and passed.

Numbered pagination follow-up: 42 work-view tests pass, plus Angular compilation and scoped lint. Fixture-backed browser checks confirm Next/Previous request page 2/1 with pageSize 100, replace rows, render totals/page numbers, and fit the paginator at 390px without overflow. Tests also cover page-size changes, filter reset, requested-page retry, busy/bounds guards, and shrinking-total clamping. The existing Nx cache warning remains unrelated to passing tests.
