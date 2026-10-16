# Implementation Plan

- [x] Create track index, spec, plan, metadata, and delivery index entry.
- [x] Replace parent-specific collapsible behavior with a shared child-route dropdown.
- [x] Cover route selection, current-route markers, collapsed mode, and role visibility with focused tests.
- [x] Verify Angular compilation, lint, and desktop/mobile browser interactions.
- [x] Update implementation documentation and complete the track.

## Verification

- All 4 rendered-sidebar tests passed, covering Finance/Reports menu opening in icon mode without navigation, active-child marking, child navigation/mobile-close invocation, active-parent updates, and member-specific report visibility.
- Angular compiler (`npx ngc -p apps/web/tsconfig.app.json --noEmit`) and focused TypeScript ESLint passed.
- Browser checks at 1440px confirmed parent menus, role-visible child links, keyboard opening, Escape focus restoration, and unchanged route/sidebar state until choosing a child.
- At 390px, opening Finance kept the mobile sheet open; selecting invoices navigated to `/finance/invoices` and closed menu/sheet. Reopening Finance marked invoices as current. Desktop/mobile screenshots were captured.
- Existing mobile-shell limitation: no visible sidebar trigger was exposed in the inspected mobile header, so its existing Control+B shortcut opened the sheet for verification. That unrelated shell behavior was not changed.
