# Implementation Plan

See [spec.md](./spec.md) for goals/non-goals. Full research notes and exact Material→Spartan file mapping captured during planning; summarized here.

## Phase 0 — Foundation (complete)

1. `npm install -D @spartan-ng/cli` (v1.4.1).
2. `npx nx g @spartan-ng/cli:init --project=web --theme=slate --stylesEntryPoint=apps/web/src/styles.scss` — added Tailwind v4 CSS layers + `@import "@spartan-ng/brain/hlm-tailwind-preset.css";` to `apps/web/src/styles.scss`.
3. Manually reconciled the generator's auto-appended duplicate `:root`/`:root.dark` token blocks with the existing accent-color-driven token system — kept the existing tokens as the single source of truth, added only the supplemental tokens Spartan/Helm components need (`--font-sans`, `--radius`, `--chart-1..5`, `--sidebar*` mapped to existing tokens).
4. Removed `node_modules/@angular/material/prebuilt-themes/azure-blue.css` from `apps/web/project.json` build styles.
5. `npm install @ng-icons/core @ng-icons/lucide`.
6. Scaffolded Spartan primitives via `npx nx g @spartan-ng/cli:ui <name>` into `libs/shared/frontend/ui/` (Nx buildable libraries, `nova` style, import alias `@spartan-ng/helm`): `button`, `dialog`, `dropdown-menu`, `select`, `switch`, `tooltip`, `sonner`, `input`, `label`, `field`, `separator` (peer dep of field). `components.json` created at repo root.
7. Updated `.github/skills/spartan-ui/SKILL.md` to use `@spartan-ng/*` package names and Nx (`npx nx g @spartan-ng/cli:ui ...`) instead of `npx spartan add`.
8. Confirmed no custom wrapper services are needed: `HlmDialogService.open(component, options)` (from `@spartan-ng/helm/dialog`) provides an imperative API equivalent to `MatDialog.open()`; `toast()` (from `@spartan-ng/brain/sonner`) provides `toast.success/error/warning/info(...)` equivalent to the existing `ToastService` API shape.
9. Verified `npx nx build web` succeeds after each step.

## Phase 1 — Shared & layout components

- `apps/web/src/app/shared/ui/confirm-dialog/*` — rebuild using `HlmDialogService` + `HlmDialogImports` + `HlmButton`; strip styling.
- `apps/web/src/app/shared/ui/toast/*` — replace `ToastService`/`ToastComponent` with `toast()` calls + `<hlm-toaster/>` mounted once in `app.html`; strip styling.
- `apps/web/src/app/layout/header/*` — `HlmDropdownMenuImports` + `NgIcon`/lucide; strip styling.
- `apps/web/src/app/layout/sidebar/*` — `NgIcon`/lucide; keep custom nav markup; strip styling.
- `apps/web/src/app/layout/main-layout/*` — strip styling (keep single full-viewport sizing rule at the shell root per Further Considerations).
- `apps/web/src/app/shared/components/user-menu/*` — `HlmDropdownMenuImports` + `NgIcon`.
- `apps/web/src/app/shared/components/dashboard-stat-card/*` — `NgIcon`; strip styling (already scss-empty).

## Phase 2 — Auth pages

- `auth-layout`, `login` (Button/Field/Input/Sonner replacing inline `MatSnackBar`), `forgot-password`, `reset-password`, `accept-invitation.component.ts` — strip styling + swap Material.

## Phase 3 — Feature pages

- `dashboard`, `cases`, `clients`, `calendar`, `documents`, `finance`, `notifications`, `reports`, `tasks-deadlines` — strip styling + `NgIcon` swap.
- `settings/*` (settings, appearance-settings, data-settings, profile-settings, workspace-settings) — Spartan Select/Switch/Field/Input/Button + `NgIcon`.
- `assistant` + `assistant/components/draft-review-panel` — Spartan Tooltip + `NgIcon`; strip styling.

## Phase 4 — Cleanup & verification

- Remove `@angular/material` from `package.json` once grep confirms zero remaining imports.
- Grep for leftover `mat-`/Material imports and for removed CSS-class categories.
- Delete now-empty `.scss` files and their `styleUrl` references.
- `npx nx run-many -t lint` and `npx nx build web` pass.

## Further Considerations (carried from planning)

1. Root/app-shell sizing exception: `html, body { height: 100% }` plus one full-viewport sizing rule at the shell root are kept even though they're "height" rules, since removing them collapses the app to 0 height.
2. Spartan Dialog's imperative API (`HlmDialogService.open`) closely matches `MatDialog.open`, so `confirm-dialog.service.ts` needs only a light rewrite, not a new overlay implementation.
3. Custom `sidebar.component.ts` markup is kept (not replaced by Spartan's `Sidebar` primitive) — can revisit later if desired.
