# Implementation report

## Implemented changes

- `/finance/settings` now loads the existing revenue-sharing editor directly instead of opening it as a large modal from a versions landing page.
- Added a settings overview with role summaries, individual agreements, extra-rule counts, effective-version status, and direct section actions.
- Added a role-default section based on roles returned by existing team references. It names fixed, percentage, and combined models while clearly stating that role defaults and fixed compensation cannot be saved by the current API.
- Overview and model role cards are real buttons: overview cards switch to “Osnovni modeli” and open the selected role’s Sheet; model cards open that same Sheet directly. Agreement and advanced-rule summary actions continue to route to their editors.
- Added a per-role Spartan Sheet with an empty model selection, conditional fixed/percentage/combined preview fields, 0–100 percentage validation, amount validation, unsaved-close confirmation, and a disabled Apply action. It does not map firm-wide rates to roles or write role preview values into published configuration.
- Consolidated the five requested sections in Serbian and English. Shared rates are under default models; calculation policies are grouped with advanced exceptions. All existing bonus, agreement, advanced-rule, simulator, and history fields remain accessible.
- Individual agreement editing now uses a centered Spartan dialog with a scrollable form and persistent actions. Advanced rules and publication also use focused Spartan dialogs. Existing typed forms, draft staging, validation, and unsaved-change handling remain in the owning editor.
- Publication now uses a Spartan dialog with a required reason, validated effective date, next version, immutable-version explanation, and field-level old/new values formatted by the existing history diff logic.
- Fixed the publication 500 reported when a version contains an individual agreement. The parent `RevenueSharingVersion` relation supplies `workspaceId`; passing the same scalar into nested agreement/rule creates is rejected by Prisma. Removed the redundant child fields and added a regression assertion for both projections.
- Version history distinguishes effective, scheduled, historical, and undetermined versions using their effective dates rather than assuming the highest version number is current.
- Unpublished edits are explicitly labeled as page-local and not server-persisted.

## Routes and components

- Route: `/finance/settings` now hosts `RevenueVersionsComponent` as a lightweight route container for `RevenueSharingComponent`.
- Route: `/finance/settings/:id` remains the existing read-only `RevenueVersionDetailComponent` route.
- Modified: `RevenueSharingComponent`, `RevenueVersionsComponent`, `RevenueSharingService`, their templates/specs, and Serbian/English localization catalogs.
- Added: `RevenuePublishDialogComponent`, `RevenueRuleDialogComponent`, and `RevenueRoleModelSheetComponent`.
- Reused: existing RevenueSharingApiClient, typed configuration/agreement/rule forms, preview endpoint, version-history diff formatter, and Spartan Button, Tabs, Sheet, Dialog, Radio Group, Input, Label, Switch, Spinner, and Table primitives.

## Functional status

- Existing shared percentage policies, member percentage agreements, advanced scoped rules, server-backed hypothetical simulator, publication, and read-only version history: functional through the existing API.
- Role-based defaults: cards are interactive and open a local-only editor based on actual active role references. Values begin empty; Fixed/Percentage/Combined selection reveals the appropriate preview fields. Apply is disabled and nothing is written to the API. Awaiting versioned role-keyed API/data support.
- Fixed monthly and combined fixed-plus-percentage compensation: conditional fields are available as an explicitly temporary preview, but cannot be applied or published; awaiting API/data and calculation support.
- Server-persisted drafts: not available. Edits remain in component state until publication and are clearly identified as page-local.
- Simulator: persistent on the right at wide widths and collapsible on smaller screens, with advanced context disclosed separately. It continues to call the server preview and creates no financial records.
- Browser verification: the local app redirected `/finance/settings` to `/login`, so authenticated browser interaction could not be exercised in this environment.

## Missing backend/database capabilities

| Missing capability                                       | Business purpose and required support                                                                                                                                                                                        | Affected UI and TODO location                                                                          | Status                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Versioned default compensation models by team role       | Store role-keyed defaults for fixed, percentage, and combined compensation, with actual role identity and effective-version semantics.                                                                                       | `RevenueSharingComponent` and `RevenueRoleModelSheetComponent` TODOs; overview and models cards/Sheet. | Interactive local preview only; persistence pending API/data support.                   |
| Fixed monthly compensation and its calculation semantics | Store fixed monthly amounts separately from per-transaction shares, on default models and individual agreements; define how these interact with transaction previews/payments. Do not repurpose `UserRate`, which is hourly. | `RevenueSharingComponent` class-level TODOs; models tab and role-model Sheet.                          | Preview fields only; persistence and authoritative calculation pending backend support. |
| Persisted unpublished drafts                             | Store and resume edits across sessions without changing the immutable effective/published version; requires a draft resource and save/load lifecycle separate from publication.                                              | `RevenueSharingComponent` class-level TODO; local-draft status in `revenue-sharing.component.html`.    | Partially implemented in page state; server persistence pending.                        |

No API contracts, Prisma models, migrations, or database structure were changed. The revenue-sharing service implementation was changed only to remove invalid nested-create fields.

## TODO inventory

All four `TODO(revenue-sharing)` comments are:

- Role-keyed fixed/percentage defaults: [RevenueSharingComponent](../../../../apps/web/src/app/features/revenue-sharing/revenue-sharing.component.ts), beside `memberRoles`.
- Monthly fixed and combined compensation: [RevenueSharingComponent](../../../../apps/web/src/app/features/revenue-sharing/revenue-sharing.component.ts), beside `memberRoles`; specifies that hourly `UserRate` must not be repurposed.
- Persisted server-side drafts: [RevenueSharingComponent](../../../../apps/web/src/app/features/revenue-sharing/revenue-sharing.component.ts), beside `memberRoles`.
- Persisted per-role models: [RevenueRoleModelSheetComponent](../../../../apps/web/src/app/features/revenue-sharing/revenue-role-model-sheet.component.ts), beside the sheet component class.

## Verification

- Focused Jest specs: 2 suites, 19 tests passed (`revenue-sharing.component.spec.ts`, `revenue-versions.component.spec.ts`), including both role-card paths and conditional role-preview fields.
- Angular development build: passed (`npx nx build web --configuration=development`).
- ESLint on changed revenue-sharing TypeScript files: passed.
- `get_errors` on changed Angular TypeScript/templates/specs: no errors.
- `git diff --check`: passed.
- Revenue-sharing API tests: 2 suites, 43 tests passed, including the new nested Prisma payload regression.
- API development build: passed, including Prisma Client generation.
- ESLint on the changed API service and spec: passed.
- The exact `PUT` was not replayed against the persistent local settings database because it could publish a real immutable revision if successful. The supplied server trace directly identified the invalid Prisma argument.
- Full `nx lint web` is not clean due to existing unrelated errors in the assistant matter-link selector, finance invoice import template equality, and shared infinite-scroll selector. The workspace test run also reported failures in unrelated Calendar, Finance Invoice, and My Time suites; the focused revenue tests pass.
- The pre-existing edit to `payment-form.component.html` was left untouched.
