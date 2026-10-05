# Organization Settings UI Refinement Plan

- [x] Create and register this child delivery track and create the matching implementation branch before application code changes.
- [x] Inspect the existing workspace routes, organization-settings forms, shared currency enum options, translations, and installed Spartan/UI Select API.
- [x] Make the active workspace settings tab explicit and accessible.
- [x] Improve invoice-number variable ordering, descriptions, preview wording, examples, and Serbian payment terminology.
- [x] Convert currency settings to enum-backed localized selects and clarify the vertically stacked precision controls.
- [x] Run formatting, Angular compilation, focused tests, and the web development build; record verification and complete the track.

## Verification results

- `npx prettier --write ...` — completed for all changed TypeScript, JSON, and delivery-track files.
- `./node_modules/.bin/ngc -p apps/web/tsconfig.app.json` — passed without diagnostics.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx test web --runInBand --testPathPatterns='(currency|organization-settings-sections\.component)\.spec\.ts'` — 2 suites / 5 tests passed.
- The Nx development build compiled all 29 dependent libraries, then the `web:build:development` process exited immediately after `Building...` without a diagnostic. Repeating with static verbose output, stream output, one worker, and two workers produced the same environment-level termination; standalone Angular compilation passed.
- `git diff --check` — passed.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
