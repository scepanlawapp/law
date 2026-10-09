# Implementation Plan

- [x] Create index, specification, plan and metadata; register delivery index.
- [x] Verify existing dialog tabs, contracts, installed Helm APIs and server mutations.
- [x] Add typed initial-tab routing and focused validation immediately after first code edit.
- [x] Implement compact responsive detail header, section actions and persisted menus.
- [x] Guard primary deletion at UI and API boundaries with focused tests.
- [x] Run targeted tests and Angular build/type checks; verify desktop/mobile interactions.
- [x] Update business behavior documentation and record results; complete metadata.

## Visual Correction Follow-Up

- [x] Replace the prior unframed specification with the concrete reference layout; reopen this track.
- [x] Implement bordered summary, below-title badges, icon-led sections and compact two-column label/value lists.
- [x] Compact retainer presentation without changing agreement behavior or permission checks.
- [x] Run ngc immediately after the first code edit, then focused client and retainer tests and one final build.
- [x] Inspect actual organization/person desktop/mobile screenshots, icon SVGs, frames, text sizes and action routing using existing records only.
- [x] Append visual verification evidence and complete this track.

## Registration Number Follow-Up

- [x] Record the scoped follow-up in the existing specification, plan and metadata.
- [x] Add the organization-only summary cell and conditional desktop tracks without changing CSS.
- [x] Run `npx ngc -p apps/web/tsconfig.app.json --noEmit` immediately after the template edit.
- [x] Verify existing organization/person headers and desktop/mobile overflow on the running app; record results and complete metadata.

Verification: Angular compilation and template editor diagnostics passed. Read-only Playwright checks on the running 4200 app reused the temporary verifier's login and existing-record lookup: organization five cells/icons and persisted registration number, individual four cells/icons; 1440px five/four tracks, 1024px two tracks and 390px one track. No page, strip or cell-content overflow and no runtime errors. Desktop/mobile organization screenshots inspected at `/tmp/client-registration-organization-{1440,390}.png`; screenshots for both client types at all three widths use `/tmp/client-registration-{organization,individual}-{1440,1024,390}.png`. Existing CSS preserved; no records created, backend/types changed, branch, commit or subagent.

## Prior Verification

- `NX_DAEMON=false npx nx test web --runInBand --testPathPatterns='client-(detail|form).component.spec.ts'`: 28 tests passed.
- `NX_DAEMON=false npx nx test api --runInBand --testPathPatterns=client-primary-contact.service.spec.ts`: 10 tests passed.
- `npx ngc -p apps/web/tsconfig.app.json --noEmit` and `npx tsc -p apps/api/tsconfig.app.json --noEmit`: passed.
- `NX_DAEMON=false NX_TUI=false npx nx build web --configuration=development --outputStyle=static`: passed; output redirected to `/tmp/law-client-detail-build.log` to avoid terminal alternate-buffer capture.
- Scoped ESLint: no errors; existing route non-null assertion warning. HTML has no matching lint configuration and is checked by Angular compilation.
- Live Playwright verification against existing services: both client types at 1440px, 1024px and 390px; no horizontal page overflow or visible detail text below 14px. All five section actions select the correct modal tab. Visible menus work; disabled primary delete is arrow-key reachable and explains the rule on hover/focus with 14px text.
- Live API-backed operations: supported address type, primary address, primary contact and mirrored summary, confirmation cancel/accept, address deletion and contact soft-deletion. Direct primary deletion/deactivation returns HTTP 400. Injected mutation failure leaves client data visible and releases pending controls. Six themes and royal-blue accent rendered, original attributes restored. No browser runtime errors.
- Screenshots: `/tmp/client-detail-{organization,individual}-{1440,1024,390}.png` and `/tmp/client-detail-organization-ivory.png`; temporary verifier `/tmp/law-client-detail-browser.cjs`.

## Caveats

- The supplied reference screenshot was not directly available; its described layout was used as the design direction.
- The existing embedded Documents API returns HTTP 500 for local client document-list requests and produces a toast even on overview. This independent endpoint failure was not changed.
- Browser verification created disposable clients, subsequently archived; secondary test contacts remain inactive by the existing soft-delete contract. Temporary addresses were removed and the seeded primary address restored.
- No branch, commit, schema changes, service restarts or avatar edits were made, per the delegated task constraints.

## Visual Follow-Up Evidence

- `npx ngc -p apps/web/tsconfig.app.json --noEmit`: passed immediately after the first substantive visual edit and after subsequent local repairs.
- `NX_DAEMON=false NX_TUI=false npx nx test web --runInBand --testPathPatterns='client-(detail|form|retainer-card).component.spec.ts' --outputStyle=static`: 3 suites, 40 tests passed. Added behavior coverage for the compact rate button's accessible name and existing dialog action, not a class snapshot.
- `NX_DAEMON=false NX_TUI=false npx nx build web --configuration=development --outputStyle=static`: passed, one follow-up build; log `/tmp/law-client-detail-visual-build.log`. Touched presentation files formatted; editor diagnostics and `git diff --check` clean.
- `node /tmp/law-client-detail-visual.cjs`: read-only browser verification passed against the existing servers and actual active POSH 33 doo Subotica / Branimir Cigale records. No new records or business-data mutations. Log `/tmp/law-client-detail-visual-check.log`.
- Both types verified at 1440, 1024 and 390px: 24px title, below-title badges, rendered 20px SVG icon tiles, bordered bg-card sections with 8px corners, label-left/value-right rows, desktop summary dividers, 16px overview gutter and 12px retainer-to-basic gap. No horizontal page overflow or visible detail text below 14px. Desktop no-agreement retainer height is 70px; mobile is 118px with the month/add/rate controls together. Primary buttons use the current gold accent via Helm, not a feature palette.
- All five section edit actions and top-level edit select the existing correct dialog tabs; mobile contact edit is usable. Existing menus remain functional. Primary delete remains disabled; its explanation renders on hover and remains visible after End-key focus. Focus alone did not open the unchanged disabled-item tooltip, so this run does not claim focus-only tooltip activation. No browser runtime errors or HTTP 500 responses occurred in this follow-up run.
- Actual images inspected, including lower-section screenshots because the shell scrolls its content separately: `/tmp/client-detail-visual-{organization,individual}-{1440,1024,390}.png` and `/tmp/client-detail-visual-{organization,individual}-{1440,390}-client-{basic,addresses,identification,contacts,notes}.png`; 1024px lower-address screenshots also captured.
- Reference fidelity assessed against the concrete screenshot description in the request; the original reference image was not attached to this follow-up. Active-agreement content and permissions covered by existing retainer tests; live records in this run had no agreement. No branch, commit, additional agent, API change or service restart.
