# Implementation Plan

- [x] Create the four track files and register the delivery index entry.
- [x] Gate dropdowns on desktop collapsed state; use installed Collapsible and submenu APIs otherwise.
- [x] Run focused sidebar Jest regressions immediately after the code edit.
- [x] Validate focused lint and Angular compilation.
- [x] Update implementation documentation and record results before completing the track.

## Verification

- Hypothesis confirmed: unconditional dropdown triggers caused expanded/mobile flyouts. Gating on non-mobile collapsed state and using local Collapsible/submenu APIs restores inline disclosure.
- `npx jest --config apps/web/jest.config.cts --runInBand --runTestsByPath apps/web/src/app/layout/sidebar/sidebar.component.spec.ts`: all 9 cases pass. Covers Finance/Reports expanded disclosure and closed inert content, collapsed dropdowns without navigation/expansion, active route markers, child selection, role visibility in both desktop modes, and mobile with a collapsed desktop preference.
- First post-code-edit action was the focused Jest run. Its two failures identified the default-off submenu mobile-close setting and an inaccurate mobile mock; both were repaired locally and the same suite rerun successfully.
- `npx eslint apps/web/src/app/layout/sidebar/sidebar.component.ts apps/web/src/app/layout/sidebar/sidebar.component.spec.ts`: passes without warnings. HTML is ignored by the existing ESLint configuration.
- `npx ngc -p apps/web/tsconfig.app.json --noEmit`: passes, including template validation.
- Jest reports its existing `esModuleInterop` advisory. Live browser interaction was not revalidated; responsive rendered-component tests exercise the real sidebar media-query and mobile-sheet path.
- No branch/commit created. Existing unrelated team-time template edits were preserved.
