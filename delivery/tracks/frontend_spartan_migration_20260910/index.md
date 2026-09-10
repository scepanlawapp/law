# Frontend Spartan/UI + Tailwind-only Migration

- **Track ID:** `frontend_spartan_migration_20260910`
- **Type:** Refactor
- **Status:** Completed

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

All phases complete. Angular Material is fully removed (`@angular/material` uninstalled, zero remaining `mat-*`/`Mat*Module` references anywhere in `apps/web/src`). All 30 components now use Spartan/UI (`@spartan-ng/brain` + Helm libraries in `libs/shared/frontend/ui/`) and `@ng-icons/core`/`@ng-icons/lucide` for icons. Non-structural CSS (colors, spacing, sizing, typography) was stripped from every component's template/stylesheet, keeping only display/flex/position utilities, so a fresh visual design can be applied next. `npx nx build web`, `npx nx run web:lint`, and `npx nx test web` all pass. The build budget was temporarily raised during migration and restored to its original 1MB/500KB values after Material removal. A jsdom `matchMedia` polyfill was added to `apps/web/src/test-setup.ts` since Spartan's Sonner toaster reads it.

Next step (separate, future effort): apply an actual visual design on top of this now-unstyled component structure.
