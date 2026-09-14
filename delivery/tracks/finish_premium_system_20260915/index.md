# Premium Finish System

- **Track ID:** `finish_premium_system_20260915`
- **Parent track:** [Executive Theme and Accent System](../theme_accent_system_20260914/index.md)
- **Type:** Feature
- **Status:** In Progress

## Documents

- [Specification](./spec.md)
- [Implementation plan](./plan.md)
- [Metadata](./metadata.json)

## Current checkpoint

Shared contracts, Prisma column/migration, DTO validation, service normalization, frontend theme service/options, Appearance settings UI, semantic CSS tokens with full gold/copper gradient recipes, reusable premium utility classes, the `premium` button variant, two example CTA usages, i18n, and focused tests are implemented and verified.

## Verification

- Prisma platform schema generates successfully with the new `finish` column.
- API build and lint pass; `user-settings.dto.spec.ts` passes (including new `finish` cases). `user-settings.controller.spec.ts` has a pre-existing, unrelated failure (untouched by this track).
- Web build and lint pass; `theme-options.spec.ts` passes (including new `finish` cases). No new SCSS budget warnings.
- Manual: switching `finish` updates `data-finish` on `<html>` via signals (no reload); settings persist through `GET/PATCH /users/me/settings`.
