# Visual Hierarchy Refinement Specification

## Goal

Preserve the application's existing professional dark visual identity, accent and premium-finish system, compact density, page structure, Angular behavior, and Spartan/UI accessibility while making data-heavy screens easier to scan.

The visual direction is layered dark surfaces with restrained warm accents: page, section, card/data region, editable field, and elevated overlay should be distinguishable without large luminance jumps, bright surfaces, decorative gold borders, or heavy shadows.

## Shared system

- Extend the existing theme with semantic page, section, card, field, hover, selected, and border concepts derived from current theme variables.
- Refine generated Helm hosts for inputs, textareas, selects, comboboxes, input groups, tables, tabs, and buttons only through their public host variants/classes and existing behavior.
- Provide reusable application patterns for filter toolbars, data regions, section/card surfaces, label/value pairs, and intentionally empty or disabled states.
- Preserve `data-theme`, `data-accent`, and `data-finish` behavior for every supported theme and accent, including the light ivory theme.

## Screen adoption

- Apply the shared filter and data-region language to Clients, Cases, Documents, Finance, and Work screens.
- Clarify label/value and summary-card hierarchy on client and case detail views.
- Clarify board, column, task-card, and drop-target hierarchy without changing Angular CDK behavior.
- Clarify finance line-item forms, document metadata/actions, assistant regions, dashboard groups, and calendar grid/event surfaces.
- Keep the sidebar structure and identity intact, limiting changes to consistency where shared treatments naturally apply.

## Accessibility and behavior constraints

- Do not change routes, API calls, business rules, form models, CDK interactions, or stored values.
- Preserve visible labels, ARIA wiring, keyboard behavior, disabled semantics, validation cues, and focus-visible rings.
- Selected, invalid, disabled, and interactive states must not rely on color alone.
- Keep visible text at 14px or larger and preserve practical interactive target sizes.
- Do not target fragile generated internals, use `::ng-deep`, or replace Spartan components with custom controls.

## Verification

- Build and lint the web project with the existing Nx targets.
- Run relevant web tests for shared and touched feature behavior.
- Exercise representative routes in the running application at desktop and narrow widths, including focus, hover, disabled, empty, validation, theme, accent, and overlay states when runtime services are available.
