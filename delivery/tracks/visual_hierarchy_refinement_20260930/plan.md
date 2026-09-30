# Visual Hierarchy Refinement Implementation Plan

- [x] Create and register the delivery track; create the matching implementation branch before code edits.
- [x] Inventory current theme definitions, generated Helm hosts, and repeated field, filter, table, tab, card, detail, board, finance, document, assistant, dashboard, and calendar patterns.
- [x] Add semantic surface and border tokens for all supported themes and expose reusable Tailwind/application utilities.
- [x] Refine shared Helm control, overlay, table, tab, and button host styles while preserving component APIs and accessibility behavior.
- [x] Adopt reusable filter, data-region, section, label/value, and empty-state patterns across primary application routes.
- [x] Refine work boards, finance entry rows, Documents, Assistant, Dashboard, and Calendar with the same hierarchy system.
- [x] Remove local styles that conflict with the shared visual language without changing layout or functionality.
- [x] Verify web build, lint, relevant tests, and representative runtime interaction/theme states.
- [x] Record verification results and remaining limitations; mark metadata complete.

## Primary-text hover follow-up (2026-09-30)

- [x] Inventory neutral hover and highlighted states across shared selects, menus, buttons, tables, cards, and feature-specific interactive rows.
- [x] Change neutral hover text to the semantic primary color while preserving primary, destructive, selected, disabled, and editable-field behavior.
- [x] Apply the same behavior to native selects and feature-specific cards/rows that do not use a shared primitive.
- [x] Verify the web build, targeted lint/tests, and the final diff; record results and mark the track complete again.

### Follow-up verification results

- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx build web --configuration development --skip-nx-cache --output-style=static` — passed outside the filesystem sandbox after the sandboxed esbuild service deadlocked; all shared Helm dependencies and the Angular application compiled.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx test web --skip-nx-cache --runInBand --output-style=static` — 27 suites / 130 tests passed.
- Direct ESLint over every changed Helm TypeScript file passed.
- `NX_DAEMON=false NX_ISOLATE_PLUGINS=false NX_TUI=false npx nx lint web --skip-nx-cache --output-style=static` — changed templates produced no errors; the target remains blocked by the two pre-existing errors recorded above and reports the same two pre-existing warnings.
- Prettier over all follow-up files and `git diff --check` passed.

## Verification results

- `NX_TUI=false npx nx build web --configuration development --skip-nx-cache` — passed; all Angular templates, TypeScript, shared Helm libraries, and Tailwind styles compiled.
- `NX_TUI=false npx nx build web --skip-nx-cache` — compilation passed, then the existing production initial-bundle budget failed at 1.78 MB against the 1.75 MB error threshold. The existing assistant stylesheet budget warning also remains; neither is a type/template/style compilation failure.
- `NX_TUI=false npx nx test web --skip-nx-cache --runInBand` — 27 suites / 130 tests passed.
- `NX_TUI=false npx nx lint web --skip-nx-cache` — no errors remain in the changed templates. The workspace target still fails on two pre-existing errors in untouched files: the selector in `assistant/matter-link.component.ts` and the empty sidebar trigger in `layout/sidebar/sidebar.component.html`; it also reports two pre-existing warnings.
- Direct ESLint over every changed Helm TypeScript file passed. The standalone ESLint invocation does not load the Nx Angular-template processor, so changed templates were verified through the full web lint target above.
- `git diff --check` — passed.
- Browser runtime on the charcoal/gold theme confirmed derived surface tokens, a visibly filled field background and neutral border, 36px effective field height, and a single 3px accent focus ring under keyboard navigation.

## Runtime review limitation

The local API and Angular dev server were available, but authenticated-route browser automation could not proceed because the computer-use environment replaces password input with a redacted placeholder. Authentication was not weakened and no bypass was added. Authenticated screens were therefore verified through successful compilation, tests, linting, source review, and shared-system adoption rather than an automated signed-in browser walkthrough.

## Status convention

`[ ]` not started, `[~]` in progress, `[x]` completed.
