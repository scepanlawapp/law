# Plan

- [x] Create branch, track and delivery index entry.
- [x] Compose the user menu from existing sidebar primitives.
- [x] Verify collapsed/expanded layout and dropdown behavior; build.
- [x] Complete track.

## Validation

- Web development build passed.
- Sidebar, avatar and user-menu suites: 6 tests passed, including keyboard and pointer dropdown opening, settings link and logout emission.
- Headless Chromium layout fixture using compiled application styles and installed Helm classes: collapsed trigger and avatar are 32px, centered at x=24 in a 48px sidebar; name/chevron hidden; expanded and mobile labels visible; no overflow. This was an isolated layout check, not a live authenticated app session.
- `git diff --check` passed.
