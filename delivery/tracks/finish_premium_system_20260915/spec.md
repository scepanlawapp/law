# Premium Finish System Specification

## Goals

- Add a third, independent appearance dimension, `finish` (`SOLID | METALLIC | BRUSHED | MATTE | LUXURY`), alongside the existing `theme` and `accentColor` preferences.
- Default every user to `SOLID`, which must be visually identical to the current application.
- Give GOLD and COPPER accents genuine, restrained metallic/brushed/matte/luxury gradient treatments for opt-in premium surfaces (primary CTA buttons, badges, small indicators).
- Keep the effect selective: normal cards, tables, dialogs, inputs, and page backgrounds remain flat: only a small number of primary actions/indicators use the premium surface.
- Persist `finish` exactly like `theme`/`accentColor` and apply it live (no page refresh) via the existing `data-*` attribute mechanism on `<html>`.

## Non-goals

- Full METALLIC/BRUSHED/MATTE/LUXURY gradient recipes for EMERALD, ROYAL_BLUE, ICE_BLUE, BURGUNDY, PURPLE, and IVORY. These accents render as SOLID regardless of the selected finish for now; the architecture (contract, DB column, DOM attribute) already supports adding their gradients later without further backend/type changes.
- Changing any existing `theme` or `accentColor` value, default, or migration.
- A new Postgres enum type (`finish` is a plain string column, matching the existing `accentColor` pattern).
- Rewriting Spartan/UI components; only the shared `hlmBtn` variant map gains one new `premium` option.

## Product behavior

- New and existing users default to `finish = "SOLID"`.
- Appearance settings gains a "Finish" radio group (mirroring the existing accent-color radio group) with a small gradient swatch preview per option, reusing the same CSS variables the real premium surfaces use.
- Switching finish/theme/accent updates the UI immediately via Angular signals; no reload required.
- Settings persist across reload and login through `GET/PATCH /users/me/settings`.
- Invalid/legacy `finish` values fall back safely to `SOLID` on both frontend and backend.
