# Premium Finish System Plan

- [x] Create the delivery track and register it in the delivery index.
- [x] Add `UserSettingsFinish` to shared API contracts and `UserSettingsPreferences`.
- [x] Add `finish` to the Prisma `UserSettings` model (platform + legacy mirror schema) and create an additive migration defaulting existing rows to `SOLID`.
- [x] Add `finish` validation to `UpdatePreferencesDto` and normalization/defaults to `UserSettingsService`.
- [x] Add frontend `finish` normalization/CSS-mapping helpers (`theme-options.ts`) and apply them through `ThemeService` (`data-finish` attribute).
- [x] Add a Finish radio group with gradient swatches to the Appearance settings form.
- [x] Add semantic CSS tokens (`--primary-surface*`, `--premium-border/shadow/highlight`) defaulting to solid, plus full gold/copper gradient recipes for METALLIC/BRUSHED/MATTE/LUXURY.
- [x] Add reusable `.premium-primary` / `.premium-badge` / `.finish-swatch` utility classes.
- [x] Merge the premium surface into the default `hlmBtn` variant (and sidebar active nav links) so it applies automatically wherever `--primary`/`--sidebar-primary` was used, instead of requiring an explicit opt-in variant.
- [x] Restrict the Finish picker in Appearance settings to the GOLD accent (hidden for all other accents; `finish` resets to `SOLID` when the accent changes away from GOLD).
- [x] Add English and Serbian translations for the finish labels.
- [x] Add/extend focused frontend and backend tests.
- [x] Run Prisma, frontend, backend, lint, build, and manual verification.

## Verification results

- `prisma generate --schema apps/api/prisma/platform.prisma`: succeeds; `finish` present on the generated `UserSettings` type.
- `nx build api`: succeeds, no type errors.
- `nx test api --testPathPatterns=user-settings`: `user-settings.dto.spec.ts` passes (3/3, including new `finish` cases). `user-settings.controller.spec.ts` fails with a pre-existing, unrelated compile error (`Expected 3 arguments, but got 4` in a controller constructor call) — not touched by this track; confirmed via `git status` that the file was not modified here.
- `nx lint api`: passes (0 errors, 4 pre-existing warnings unrelated to this change).
- `nx test web --testPathPatterns=theme-options`: passes (3/3, including new `finish` normalization/CSS-mapping cases).
- `nx lint web`: passes (0 errors, 2 pre-existing warnings unrelated to this change).
- `nx build web --skip-nx-cache`: succeeds; no SCSS "component style budget exceeded" warnings (only the pre-existing initial bundle size budget warning, unrelated to CSS).

## Decisions

- `finish` is a plain `String` column (matches `accentColor`, not a Postgres enum like `theme`), validated at the DTO/service layer.
- Only GOLD and COPPER get full premium gradient recipes in CSS now; the other 6 accents stay visually SOLID for every finish value until a follow-up track.
- `apps/api/prisma/schema.prisma` (unused by any `db:migrate`/`generate` script) is kept in sync with `platform.prisma` for consistency, but has no corresponding migration.
- Per follow-up direction, the `default` `hlmBtn` variant (not a separate `premium` variant) and sidebar active `routerLinkActive` links now use `.premium-primary` directly. This is safe because `--primary-surface`/`--premium-*` default to the flat `--primary` value, so every accent/finish other than GOLD (and CSS-supported COPPER) renders identically to before.
- The Appearance settings Finish picker is shown only when `accentColor === "GOLD"` (per explicit user direction), even though COPPER also has CSS gradient support; COPPER's gradients remain reachable only if a GOLD-selected finish value is later paired with a COPPER accent change without an intervening reset, which does not happen today since switching away from GOLD forces `finish` back to `SOLID`.
