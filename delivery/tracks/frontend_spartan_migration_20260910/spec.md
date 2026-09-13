# Frontend Spartan/UI + Tailwind-only Migration Specification

## Goals

- Install and configure Spartan/UI (`@spartan-ng/cli`, `@spartan-ng/brain`, Helm code copied into `libs/shared/frontend/ui/`) as the primary component library for `apps/web`, replacing Angular Material entirely.
- Replace Angular Material usage across all 30 frontend components:
  - `MatButtonModule` → `HlmButton`
  - `MatFormFieldModule`/`MatInputModule` → Spartan `Field`/`Input`/`Label`
  - `MatIconModule` (`mat-icon`, 14 files) → `@ng-icons/core` + `@ng-icons/lucide` (`<ng-icon>`)
  - `MatSnackBar`/`MatSnackBarModule` → Spartan Sonner (`toast()` from `@spartan-ng/brain/sonner` + `HlmToaster`)
  - `MatTooltipModule` → Spartan Tooltip
  - `MatSelectModule` → Spartan Select
  - `MatSlideToggleModule` → Spartan Switch
  - `MatMenuModule` → Spartan Dropdown Menu
  - `MatDialogModule`/`MatDialogRef`/`MAT_DIALOG_DATA` → Spartan Dialog (`HlmDialogService.open(...)`)
- Strip all non-structural CSS (colors, backgrounds, borders, opacity, shadows, margin, padding, font-size/weight, letter-spacing, line-height, explicit width/height, `rounded-*`, `gap-*`) from every app component's `.html`/inline template and `.scss`, keeping only display (`flex`, `grid`, `block`, `hidden`, etc.), flex/grid direction & alignment (`flex-row`, `flex-col`, `items-*`, `justify-*`), and position (`relative`/`absolute`/`fixed`/`sticky`/`static` plus offsets `top/right/bottom/left/inset` and `z-*`) utilities — so a fresh visual design can be applied afterward with minimal HTML/structure changes.
- Delete `.scss` files (and their `styleUrl` references) that end up empty after stripping.
- Remove `@angular/material` and the Material prebuilt theme stylesheet entirely once no references remain.
- Keep the existing semantic token system in `apps/web/src/styles.scss` (light/dark + 4 accent colors) as the single source of truth; Spartan's own default token set is merged in as a supplement, not a replacement.
- Update `.github/skills/spartan-ui/SKILL.md` to reflect the real `@spartan-ng/*` package names and Nx-based CLI workflow (done).

## Non-goals

- Applying an actual visual design — this track intentionally leaves components visually unstyled/skeletal. Design application is a separate, later effort.
- Replacing the custom `sidebar.component.ts` markup with Spartan's dedicated `Sidebar` primitive (kept as-is structurally, restyled later).
- Introducing new features or changing business logic/behavior of any page.
- Multi-jurisdiction/i18n changes beyond what already exists (`TranslatePipe`).

## Approach

1. **Phase 0 — Foundation** (done): install `@spartan-ng/cli`/`@spartan-ng/brain`, `@ng-icons/core`/`@ng-icons/lucide`; configure `apps/web/src/styles.scss` (Tailwind v4 CSS layers + Spartan preset import, merged supplemental tokens); remove Material theme from `apps/web/project.json`; scaffold Spartan primitives (`button`, `dialog`, `dropdown-menu`, `select`, `switch`, `tooltip`, `sonner`, `input`, `label`, `field`, `separator`) into `libs/shared/frontend/ui/`.
2. **Phase 1 — Shared & layout components**: confirm-dialog, toast, header, sidebar, main-layout, user-menu, dashboard-stat-card. These establish the interaction patterns (dialog via `HlmDialogService`, toast via `toast()`, dropdown menu, icons) reused everywhere else.
3. **Phase 2 — Auth pages**: auth-layout, login, forgot-password, reset-password, accept-invitation.
4. **Phase 3 — Feature pages**: dashboard, cases, clients, calendar, documents, finance, notifications, reports, tasks-deadlines, settings/\* (select/switch), assistant + draft-review-panel (tooltip).
5. **Phase 4 — Cleanup & verification**: remove `@angular/material` dependency, grep-verify no Material/`mat-*` leftovers, delete emptied `.scss` files, confirm build/lint pass.

## Users

All frontend users of the law office application (internal staff across all roles) — this is a purely internal engineering/UI-foundation change with no behavior differences for end users beyond a temporarily unstyled UI until the follow-up design pass.
