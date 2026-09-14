# Executive Theme and Accent System Specification

## Goals

- Replace `SYSTEM`, `LIGHT`, and `DARK` with `MIDNIGHT`, `DEEP_NAVY`, `CHARCOAL`, `DARK_TEAL`, `BURGUNDY`, and `IVORY`.
- Replace `BLUE`, `TEAL`, `CORAL`, and `VIOLET` with `GOLD`, `EMERALD`, `ROYAL_BLUE`, `COPPER`, `ICE_BLUE`, `BURGUNDY`, `PURPLE`, and `IVORY`.
- Keep theme and accent independent so every supported combination can be selected.
- Provide a restrained, executive-grade visual system for dashboards, tables, forms, financial views, navigation, and dialogs.
- Use semantic CSS variables so Spartan/UI components update without component-specific palette overrides.
- Migrate existing users safely: old dark themes become `MIDNIGHT`, old light becomes `IVORY`, and old accents map to their closest new values.

## Non-goals

- Renaming the persisted `accentColor` field.
- Preserving old appearance values in runtime validation after the coordinated deployment.
- Redesigning unrelated application workflows or component structure.
- Adding operating-system theme detection.

## Product behavior

- New and missing settings default to `MIDNIGHT` and `GOLD`.
- Domain/API values remain uppercase; document attributes use lowercase kebab-case.
- Invalid or legacy values received by the frontend fall back safely without crashing.
- Accent selection retains the existing swatch/radio interaction.
- Status colors remain semantically meaningful and independent of the selected accent.
- Normal application text remains neutral; accents are reserved for actions, selection, focus, indicators, and data highlights.
