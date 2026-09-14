# Executive Theme and Accent System Plan

- [x] Create the delivery track and register it in the delivery index.
- [x] Update shared settings contracts and backend DTO validation.
- [x] Update Prisma defaults and create the platform migration for existing settings.
- [x] Add centralized theme/accent values, normalization, and safe fallbacks.
- [x] Refactor theme startup/application behavior to apply both DOM attributes.
- [x] Replace appearance settings options and preserve the swatch selector.
- [x] Refactor semantic theme, accent, sidebar, status, and chart tokens.
- [x] Add Serbian and English translations and remove obsolete appearance keys.
- [x] Add focused frontend and backend tests.
- [~] Run Prisma, frontend, backend, lint, build, and stale-reference verification.

## Migration mappings

- `SYSTEM` and `DARK` -> `MIDNIGHT`
- `LIGHT` -> `IVORY`
- `BLUE` -> `ROYAL_BLUE`
- `TEAL` -> `EMERALD`
- `CORAL` -> `COPPER`
- `VIOLET` -> `PURPLE`

## Decisions

- Keep the API/database property name `accentColor`.
- Frontend and backend deploy together; old values are accepted only by migration SQL.
- Platform Prisma owns `UserSettings`; no tenant migration is expected unless implementation reveals otherwise.
