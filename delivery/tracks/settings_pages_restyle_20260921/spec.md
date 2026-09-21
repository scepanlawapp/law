# Settings Pages Restyle Specification

Restyle the existing Angular settings pages so they visually belong to the same application as the AI assistant workspace.

## Included

- Two-column settings shell inspired by the assistant sidebar (muted nav, selected state, compact heading).
- Shared content layout: page title, muted description, header divider, constrained form width, section spacing, right-aligned actions.
- Profile, Appearance, Workspace, and Data presentation updates without changing form behavior.
- Responsive stacking of navigation and field grids.
- Semantic theme tokens and installed Spartan/UI controls.

## Excluded

- Backend, DTO, route, validator, save-handler, permission, or confirmation-flow changes.
- A second settings information architecture or additional pages.
- Hard-coded gold/accent colors; the active theme supplies those tokens.

## Goals

- Remove the redundant stacked Account / Settings header above the layout.
- Make the active navigation item persistently visible, separate from keyboard focus.
- Keep forms readable (about 48–56rem), with no nested page scrollbars.
- Support all existing themes, including Ivory.
