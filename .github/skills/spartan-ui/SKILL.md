---
name: spartan-ui
description: Implement, review, and troubleshoot Angular interfaces using Spartan/UI in the Law Office Nx project. Use for Helm components, Brain primitives, forms, service-driven dialogs, notification badges, navigation, tables, feedback, and component selection. Preserve installed APIs and the project's semantic themes.
---

# Spartan/UI for the Law Office Angular Project

## Scope and source of truth

Use this skill for Angular UI work in this project. The project uses Angular standalone components, signals, Reactive Forms, Tailwind CSS v4, and Spartan/UI. Treat Angular 22, Nova styling, and the workspace paths below as supplied project context; verify them in the actual checkout before changing code.

Documentation reviewed: **2026-09-16**. The catalog covers all **62 component families** listed in Spartan's component navigation on that date, plus Typography, Scroll Fade, Shimmer, Reactive Forms, and Signal Forms. It is a selection/composition guide, not a promise that every API exists in every installed release.

Use this precedence for implementation:

1. User requirements and project instructions.
2. Installed package versions, generated Helm source, exported symbols, and existing working project patterns.
3. Official documentation and source corresponding to those versions.
4. Examples in this skill.

Before implementing, read `components.json`, `package.json`, the lockfile, TypeScript path mappings, and the relevant generated Helm files. Use `rg` to inspect selectors, exports, inputs, outputs, providers, host directives, and control value accessors. If supported by the installed CLI, run `npx nx g @spartan-ng/cli:info --json` for read-only discovery. Do not install a newer CLI merely to run discovery.

Never invent `Hlm*Imports`, selectors, variant names, events, or services from naming conventions. In particular, not every component needs a direct Brain import, and not every documentation page represents a standalone component package.

## Architecture and generation

- **Brain:** `@spartan-ng/brain/<family>` provides behavioral primitives where needed. It is an npm dependency.
- **Helm:** generated, project-owned styled components/directives. The `@spartan-ng/helm/<family>` alias normally resolves to local code here; do not assume it is an npm package to install.
- **Composition:** domain components and services combine Helm parts. Reuse Helm primitives; create a reusable application wrapper when it centralizes meaningful behavior such as notification counts or client dialogs. Do not duplicate the primitive's focus, keyboard, portal, or ARIA implementation.

Expected project configuration, to verify rather than overwrite:

```json
{
  "componentsPath": "libs/shared/frontend/ui",
  "buildable": true,
  "generateAs": "library",
  "importAlias": "@spartan-ng/helm",
  "style": "nova"
}
```

Use the local Nx runner in this workspace:

```bash
npx nx g @spartan-ng/cli:ui badge
npx nx g @spartan-ng/cli:ui dialog
```

Read the installed generator's help/schema before passing automation flags. Preserve `components.json`; do not assume CLI flags override existing configuration. Generate only missing components and their required dependencies. Do not regenerate customized Helm files, rerun theme setup, or migrate unrelated components just to implement a feature.

When an upgrade is requested, review [Spartan's update guide](https://spartan.ng/documentation/update-guide). Brain/CLI updates and copied Helm updates are distinct. Healthcheck can mutate files; Helm migration can overwrite customizations. Inspect their scope and diff instead of treating them as read-only diagnostics.

## Angular implementation conventions

- Use standalone components, `inject()`, signals for view state, `computed()` for derived state, and `OnPush` where consistent with the project.
- Use `@if`, `@for`, and `@switch`; retain structural portal directives where required by Spartan. Track records by stable IDs, and dynamic form controls by control identity when appropriate.
- Put components/directives/pipes or statically analyzable exported import arrays in `@Component.imports`. Put injectable services in dependency injection, not in `imports`. For static evaluation errors, inspect the exact export and circular dependencies; do not assume spreading an invalid import fixes it.
- Keep existing typed Reactive Forms. Signals for UI state do not require migration to Signal Forms. Use one forms strategy per control.
- Import `ReactiveFormsModule` for reactive bindings. Use a component's actual CVA or documented adapter; do not add `ngDefaultControl` as a generic fix for a custom control with no value accessor.
- Use `@ng-icons/core` and the installed icon collection, normally Lucide. Register icons with `provideIcons`. Give icon-only buttons translated accessible names and `type="button"` unless they submit a form.
- Keep translated labels separate from persisted enum values and IDs. Do not send translated text to the API as an identifier.
- For long-lived streams owned by a component, use `takeUntilDestroyed` with its `DestroyRef`. In methods outside an injection context, pass the injected reference explicitly. Root-service destruction occurs at application teardown; it is not per-dialog cleanup.
- Check shared template IDs when multiple instances can coexist, including label targets, radio names, descriptions, form IDs, and overlays.
- Keep Select and Combobox triggers container-bound (`w-full min-w-0 max-w-full`) and truncate long selected labels so changing a value never changes the surrounding layout width. Overlay content defaults to `width="trigger"`; use `width="content"` only when options need more room. Content-width overlays may grow to their longest item but must remain capped at `32rem` and the viewport. Apply the same contract to Autocomplete when that Helm family is added.

## Styling, themes, and accessibility

Prefer Helm's own variants and composition. Use minimal layout utilities where needed for grids, responsive width, scrolling, or a positioned indicator. Do not introduce custom colors, borders, shadows, fonts, or animations in feature code to imitate a component that already exists. If the current task explicitly forbids layout classes too, preserve that constraint and explain any necessary layout tradeoff.

Keep the project's minimum visible text size of **14px**. Inspect compact generated styles and badge defaults; do not assume Nova guarantees the minimum. Make reusable design-system adjustments in the appropriate shared Helm source when authorized, rather than scattering overrides through feature templates.

Use existing semantic tokens:

| Purpose           | Tokens/utilities                                                             |
| ----------------- | ---------------------------------------------------------------------------- |
| Page              | `--background`, `--foreground`; `bg-background`, `text-foreground`           |
| Cards             | `--card`, `--card-foreground`                                                |
| Overlays          | `--popover`, `--popover-foreground`                                          |
| Primary/secondary | `--primary`, `--primary-foreground`, `--secondary`, `--secondary-foreground` |
| Muted/accent      | `--muted`, `--muted-foreground`, `--accent`, `--accent-foreground`           |
| Destructive       | `--destructive`; use the paired foreground only if defined by this theme     |
| Controls/focus    | `--border`, `--input`, `--ring`                                              |
| Sidebar           | Existing `--sidebar-*` tokens                                                |
| Charts            | Existing `--chart-1` through `--chart-5`                                     |

The supplied application uses `html[data-theme]` and `html[data-accent]` with blue/turquoise/coral/purple accents. These are **application conventions**, not automatic Spartan behavior. Verify that CSS selectors and Tailwind variants connect them to the tokens. Preserve this system; do not replace it with `.dark` simply because an upstream example uses `.dark`. Do not hard-code slate/blue/red overrides in feature templates. Add a semantic success/warning token only when the design requires it and the theme defines it for all supported modes.

Use real headings, buttons, links, fieldsets, labels, and native table elements. Keep Brain's keyboard/focus behavior and ARIA wiring. Connect a label to the actual input/trigger ID, not merely a wrapper. Ensure error descriptions are associated with controls. Do not make tooltips or color the only way to understand an action or status. Prefer logical layout properties for RTL, and preserve the project's direction provider and locale setup.

## Component catalog

Read the linked official page and local implementation for the family being used. The following tables give the component's purpose, important composition, and implementation traps. Exact imports and input signatures must be checked locally. Do not load or generate every family for one task.

### Actions, labels, identity, and basic layout

| Family                                                     | Use and composition                                                                                                    | Implementation guidance                                                                                                                                                                      |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Button](https://spartan.ng/components/button)             | `button[hlmBtn]` or `a[hlmBtn]`; variants/sizes from the generated button source.                                      | Use buttons for actions and links for navigation. Specify button type in forms. Disabled styling alone does not disable an anchor. Keep pending feedback and prevent duplicate action calls. |
| [Button Group](https://spartan.ng/components/button-group) | `hlmButtonGroup` with buttons, group text, and separators.                                                             | Use for related commands or split actions. It does not itself manage selected values; choose Toggle Group for selection. Keep independent accessible names.                                  |
| [Badge](https://spartan.ng/components/badge)               | `hlmBadge` for compact status labels and counts; documented variants include default, secondary, destructive, outline. | Use the notification composition below for an overlaid count. A badge is not automatically positioned or interactive. Do not invent success/warning variants.                                |
| [Avatar](https://spartan.ng/components/avatar)             | `hlm-avatar`, `img[hlmAvatarImage]`, fallback; avatar badge and avatar group/count where exported.                     | Supply meaningful identity or decorative-image semantics. Use the avatar badge for avatar-specific status, with accessible text. Handle missing/broken images through fallback.              |
| [Card](https://spartan.ng/components/card)                 | Card container, header, title, description, action, content, footer.                                                   | Preserve meaningful heading levels. A card is not automatically clickable. Use an actual link/action and avoid nested interactive targets.                                                   |
| [Item](https://spartan.ng/components/item)                 | Item/group with media, content, title, description, actions, header/footer, separator.                                 | Prefer for lists of client/document summaries that are not tabular. Use a link variant/host for navigation only when valid. Avoid placing buttons inside a clickable anchor.                 |
| [Separator](https://spartan.ng/components/separator)       | `hlm-separator` or `hlmSeparator`.                                                                                     | Choose orientation and decorative/semantic behavior from the installed API. A vertical separator needs meaningful container height. Do not use it instead of a section heading.              |
| [Aspect Ratio](https://spartan.ng/components/aspect-ratio) | `[hlmAspectRatio]` on a media container.                                                                               | Set a usable width and ratio, then choose image fit/cropping intentionally. Preserve alternative text. It constrains geometry, not image loading.                                            |
| [Kbd](https://spartan.ng/components/kbd)                   | `kbd[hlmKbd]` and `kbd[hlmKbdGroup]`.                                                                                  | Display shortcut hints. Implement shortcut handling separately, respect focused text inputs, and show platform-appropriate modifiers.                                                        |

### Form controls and choices

| Family                                                       | Use and composition                                                                                        | Implementation guidance                                                                                                                                                                                                                       |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Field](https://spartan.ng/components/field)                 | Field/group/set/legend, label, content, description, error, separator.                                     | Prefer this structure for labeled controls and grouped forms. Inspect error visibility/validator integration. Styling a field does not create validators or supply a value accessor.                                                          |
| [Label](https://spartan.ng/components/label)                 | `hlmLabel` on a real label.                                                                                | Use `hlmFieldLabel` inside field compositions when appropriate. Match `for` to the actual control ID and retain visible labels instead of relying on placeholders.                                                                            |
| [Input](https://spartan.ng/components/input)                 | `input hlmInput` for ordinary text-like entry.                                                             | Set native type/autocomplete/inputmode intentionally. Keep JMBG, PIB, account numbers, and document IDs as strings; leading zeros are data. Use `tel` or text semantics where appropriate.                                                    |
| [Textarea](https://spartan.ng/components/textarea)           | `textarea hlmTextarea` for multiline notes.                                                                | Preserve labels, validation, and useful resizing/scrolling. Do not replace a textarea with a contenteditable region for plain text entry.                                                                                                     |
| [Input Group](https://spartan.ng/components/input-group)     | Group with `hlmInputGroupInput`/Textarea, addon, text, button.                                             | Use for search icons, units, prefixes, suffixes, and attached actions. Use its input directives rather than stacking conflicting ordinary input styles. Label the input and each action separately.                                           |
| [Input OTP](https://spartan.ng/components/input-otp)         | Documented composition uses `brn-input-otp hlmInputOtp`, Helm groups, slots, separator.                    | Import the required Brain root as well as Helm. Match slot indexes to length; preserve leading zeros, paste, autofill, and accessible labeling. Authentication/verification remains backend behavior.                                         |
| [Checkbox](https://spartan.ng/components/checkbox)           | `hlm-checkbox` with label targeting `inputId`; checked/indeterminate behavior from installed API.          | Use for independent choices or row selection. Distinguish indeterminate from false. Define whether select-all means current page or every matching backend record.                                                                            |
| [Switch](https://spartan.ng/components/switch)               | `hlm-switch` with associated label.                                                                        | Use for on/off settings; state clearly whether changes save immediately or on form submission. If saving immediately, handle pending/failure and rollback. Do not treat checked as a DOM input event without checking the output type.        |
| [Radio Group](https://spartan.ng/components/radio-group)     | `hlm-radio-group`, `hlm-radio`, `hlm-radio-indicator indicator`, labels.                                   | Bind the form control to the group. Provide a group label/legend, stable values, and unique input IDs. Use `[value]="true"` for booleans rather than the string `"true"`.                                                                     |
| [Native Select](https://spartan.ng/components/native-select) | `hlm-native-select` with `option hlmNativeSelectOption` and optional optgroups.                            | Use for straightforward choices when native interaction is suitable. Inspect how the wrapper exposes the control ID and CVA. Map values to the API's expected type.                                                                           |
| [Select](https://spartan.ng/components/select)               | Root, trigger/value, `*hlmSelectPortal` content, group/label/items; multiple variants where exported.      | Use for predefined choices. Map stored values to display labels using `itemToString` or the installed value template API. Keep translated selected text reactive to locale changes. Use the default trigger-width overlay; set `width="content"` only for longer options. Do not make an ordinary Select pretend to provide search. |
| [Combobox](https://spartan.ng/components/combobox)           | Root/input or trigger/value, `*hlmComboboxPortal`, list/items/empty; multiple/chips APIs where supported.  | Use for searchable selection of known entities. Verify equality and item-to-string behavior for objects. Keep search text distinct from selected value. Use the default trigger-width overlay; set `width="content"` only for longer options. Avoid mixing obsolete command/popover recipes into the newer dedicated API. |
| [Autocomplete](https://spartan.ng/components/autocomplete)   | Root/search, input, `*hlmAutocompletePortal`, list/items, empty/status.                                    | Use for suggestions while typing. Decide whether arbitrary text is valid or selection is mandatory. Provide filtering and stale-request handling explicitly; a text match is not a persisted entity ID. When generated locally, follow the same bounded trigger/content width contract as Select and Combobox. |
| [Slider](https://spartan.ng/components/slider)               | `hlm-slider`; current examples bind an array of numeric thumb values.                                      | Check scalar/array signatures, min/max/step, range ordering, and thumb labels. Use a precise numeric input alongside it when exact values matter. Do not assume a scalar `FormControl<number>` fits an array-valued slider.                   |
| [Toggle](https://spartan.ng/components/toggle)               | `button hlmToggle` for one pressed/unpressed command.                                                      | Preserve pressed semantics and accessible name. Use a checkbox/switch for settings when their semantics are clearer. It is not just a differently styled ordinary button.                                                                     |
| [Toggle Group](https://spartan.ng/components/toggle-group)   | `hlm-toggle-group`, `button hlmToggleGroupItem`, single/multiple mode.                                     | Use for grouped pressed choices such as a view mode or formatting. Match the value shape to selection mode and decide whether empty selection is allowed.                                                                                     |
| [Calendar](https://spartan.ng/components/calendar)           | `hlm-calendar`; multi/range/month-year variants when available.                                            | Use for an inline date grid. Check date types, disabled dates, min/max, locale, first weekday, and i18n providers. Keep calendar dates separate from timestamps when serializing legal deadlines.                                             |
| [Date Picker](https://spartan.ng/components/date-picker)     | Dedicated picker/trigger/input; range/multiple/month-year variants in current docs.                        | Use for a field with date selection overlay. Inspect the picker API rather than assuming Calendar's input names; e.g. docs distinguish calendar min/max from picker minDate/maxDate. Validate typed input and timezone/date-only conversion.  |
| [Questionnaire](https://spartan.ng/components/questionnaire) | Form root, item fieldsets, titles/descriptions, choices/input, progress/errors, previous/next/skip/submit. | Use for guided questions, including freeform and multiple choice. Inspect Brain definitions and the forms adapter. Model skipped and unanswered explicitly; do not retrofit a questionnaire onto an ordinary client CRUD form.                |

### Overlays, menus, and navigation

| Family                                                           | Use and composition                                                                                                                 | Implementation guidance                                                                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Dialog](https://spartan.ng/components/dialog)                   | Modal content with header/title/description/footer; dynamic service or declarative root/trigger/portal.                             | Prefer the service-driven pattern below for shared client/case forms. Keep declarative and dynamic wrappers distinct. Check focus restoration, nested selects, scroll constraints, and dismissal policy.                           |
| [Alert Dialog](https://spartan.ng/components/alert-dialog)       | Root/trigger/portal/content with alert-specific title/description/footer/action/cancel.                                             | Use for consequential confirmation requiring a response. Verify action/cancel close behavior before attaching async work. Do not accidentally auto-close before a destructive API request succeeds.                                |
| [Sheet](https://spartan.ng/components/sheet)                     | Dialog-like edge panel with sheet root, trigger, portal, content, header/title/description/footer/close.                            | Use for complementary side content or filters. Configure the side and responsive width. Preserve dialog accessibility and reachable controls. Do not invent a sheet service from the dialog service's name.                        |
| [Drawer](https://spartan.ng/components/drawer)                   | Bottom-sheet dialog with drawer root/trigger/portal/content and header/footer parts.                                                | Use for a bottom presentation, often on narrow screens. Check actual gesture, dismissal, and scrolling support. Avoid rendering simultaneous dialog and drawer instances of one form.                                              |
| [Popover](https://spartan.ng/components/popover)                 | Root/trigger and `*hlmPopoverPortal` content, with header/title/description when available.                                         | Use for anchored interactive content. Check positioning and focus behavior. Use Dialog for a full modal workflow and Tooltip for brief noninteractive help.                                                                        |
| [Tooltip](https://spartan.ng/components/tooltip)                 | Current simple API: `[hlmTooltip]` on the trigger.                                                                                  | Use for supplementary text on hover/focus. Keep accessible names on icon buttons independently. Do not put forms or actions in tooltips or depend on hover-only instructions.                                                      |
| [Hover Card](https://spartan.ng/components/hover-card)           | Root/trigger with portal/content for a rich preview.                                                                                | Use for optional previews. Make essential information reachable through the underlying link/detail view; do not rely on hover cards for keyboard/mobile-only workflows.                                                            |
| [Dropdown Menu](https://spartan.ng/components/dropdown-menu)     | Trigger references an `ng-template` containing menu/groups/items; separators, submenus, checkbox/radio items as needed.             | Use for commands. Content defaults to the trigger width; set `width="content"` for bounded intrinsic sizing when labels or rich content need more room. Keep interactive menu semantics and subtrigger nesting. Shortcut labels do not register shortcuts. Verify close/focus ordering when an item launches a dialog. |
| [Context Menu](https://spartan.ng/components/context-menu)       | `[hlmContextMenuTrigger]` with dropdown-menu content in the current composition.                                                    | Supply right-click/long-press actions as an additional path. Keep essential commands available through a visible button/menu too. Check keyboard invocation and touch behavior.                                                    |
| [Menubar](https://spartan.ng/components/menubar)                 | `hlm-menubar`, triggers pointing to dropdown-menu templates.                                                                        | Use for persistent application command menus. Preserve arrow-key navigation between menus. Do not use menu roles to represent ordinary route navigation.                                                                           |
| [Command](https://spartan.ng/components/command)                 | Command root, search input, list, groups/labels, items, empty-state directive, shortcuts; command dialog where exported.            | Use for an action palette or command search. Implement the chosen command and shortcuts explicitly. For entity-valued form fields prefer Combobox/Autocomplete and their forms APIs.                                               |
| [Navigation Menu](https://spartan.ng/components/navigation-menu) | Navigation root/list/items with triggers/portal content and links.                                                                  | Use for site navigation. Preserve real link destinations, active state, and keyboard access; keep application commands in menus.                                                                                                   |
| [Breadcrumb](https://spartan.ng/components/breadcrumb)           | Navigation/list/items, links, separator, current page, optional ellipsis menu.                                                      | Describe the actual resource hierarchy; mark the current location. Verify the local `link`/router API and supply valid destinations. Do not add fake `href="#"` links.                                                             |
| [Pagination](https://spartan.ng/components/pagination)           | Navigation/list/items/links, previous/next/ellipsis; numbered/query-parameter variants if exported.                                 | Connect it to real paging state and total count. Convert backend versus UI page indexing once. Disable unavailable navigation and reset/clamp page when filters or deletions change totals.                                        |
| [Sidebar](https://spartan.ng/components/sidebar)                 | Wrapper/provider context, sidebar, header/content/footer, groups, menu items/buttons/actions/submenus, inset/trigger/rail, service. | Use the supplied service/context and responsive behavior. Keep route links and active state correct. Prefer `hlmSidebarMenuBadge` for a menu count; inspect collapsed visibility. Use sidebar tokens and label icon-only controls. |
| [Tabs](https://spartan.ng/components/tabs)                       | Root with selected tab, list, triggers, matching content values; lazy and paginated-list options where exported.                    | Use for peer views. Preserve form state deliberately when switching/lazy rendering. Reveal a hidden tab with validation errors before focusing it. Route-level navigation may need links instead.                                  |
| [Accordion](https://spartan.ng/components/accordion)             | Root with items, triggers, and content panels.                                                                                      | Use for related expandable sections. Inspect single/multiple expansion behavior. Keep triggers keyboard accessible and expose invalid fields inside collapsed panels.                                                              |
| [Collapsible](https://spartan.ng/components/collapsible)         | Root, button trigger, and content.                                                                                                  | Use for one optional disclosure section. Persist expansion in the appropriate owner; keep form controls/state alive as needed. Do not make required errors permanently invisible.                                                  |

### Data, feedback, and loading

| Family                                                 | Use and composition                                                                                                                       | Implementation guidance                                                                                                                                                                                                                                                   |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Table](https://spartan.ng/components/table)           | Native `table`, `thead`, `tbody`, `tr`, `th`, `td`, `caption` with Helm directives; `div hlmTableContainer`.                              | Use semantic tables and valid colspan. Do not copy obsolete `<hlm-table>` element examples into current directive-only code. Keep empty/error/loading states distinguishable and horizontal overflow usable.                                                              |
| [Data Table](https://spartan.ng/components/data-table) | Recipe combining Helm Table and TanStack Angular Table, controls, selection, sorting, filtering, and pagination.                          | Do not assume there is a universal `<hlm-data-table>` or matching import bundle. Verify the installed TanStack major/API. With backend pagination/filtering/sorting, configure manual behavior and avoid applying page-local transformations as if they covered all rows. |
| [Chart](https://spartan.ng/components/chart)           | Current upstream source uses `tanstack-chart hlmChart`, `HlmChartImports`, `HLM_CHART_THEME`, and `hlmChartTooltip` with TanStack Charts. | Check availability and versions locally. The public page returned no body during review; source evidence is linked below. Supply accessible summaries, units, meaningful scales, empty states, and responsive sizing. Do not substitute React/Recharts APIs.              |
| [Alert](https://spartan.ng/components/alert)           | Alert container with title/description and optional icon/action.                                                                          | Use persistent contextual information/errors. Reserve assertive announcements for urgent content; avoid announcing routine static content repeatedly. An alert does not require user confirmation like Alert Dialog.                                                      |
| [Sonner / Toast](https://spartan.ng/components/sonner) | One application `hlm-toaster`; `toast` from `@spartan-ng/brain/sonner`.                                                                   | Use for transient feedback. Keep field errors near inputs and critical failures persistently visible. Avoid mounting one toaster per modal and avoid duplicate success notifications across service/caller. Verify overlay stacking in the installed CDK setup.           |
| [Empty](https://spartan.ng/components/empty)           | Empty container/header/media/title/description/content.                                                                                   | Distinguish an empty dataset from no search results, loading, and request failure. Show a relevant create/reset-filter/retry action instead of one generic message for all states.                                                                                        |
| [Progress](https://spartan.ng/components/progress)     | Progress root and indicator.                                                                                                              | Use meaningful value/max for measurable progress. Use an indeterminate pattern supported by the API when progress is unknown. Supply an accessible label; do not fabricate percentages.                                                                                   |
| [Spinner](https://spartan.ng/components/spinner)       | `hlm-spinner`, using the icon system.                                                                                                     | Pair it with meaningful busy text/state. Preserve button names during saving and prevent duplicate submissions. Do not leave an endless spinner when the operation fails.                                                                                                 |
| [Skeleton](https://spartan.ng/components/skeleton)     | `hlm-skeleton` or `hlmSkeleton`, sized to expected content.                                                                               | Use for loading structure, not empty results. Avoid layout jumps and give the region a separate accessible loading indication. Stop placeholder rendering on error.                                                                                                       |

### Media, conversation, and workspace panels

| Family                                                   | Use and composition                                                                          | Implementation guidance                                                                                                                                                                                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Attachment](https://spartan.ng/components/attachment)   | Attachment/group with media, content/title/description, actions/trigger, state/orientation.  | Use for file previews, metadata, and upload status. File selection, transfer, cancellation, authorization, and persistence are application responsibilities. Distinguish removing a queued upload from deleting a stored legal document. |
| [Message](https://spartan.ng/components/message)         | Message/group, avatar, content, header/footer, alignment.                                    | Use as a conversation row containing Bubble, Attachment, or other content. Include author/time/status where useful. Handle sanitization, streaming, and persistence outside the visual primitive.                                        |
| [Bubble](https://spartan.ng/components/bubble)           | Bubble/group, content, reactions, variants/alignment; check collapsible options.             | Use for conversational content within a message. Interactive reactions need real buttons and labels. Keep sender meaning available to assistive technology; do not encode it only by side/color.                                         |
| [Marker](https://spartan.ng/components/marker)           | Marker with icon/content and separator variant.                                              | Use for conversation events or system notes, such as processing status. It is not the generic corner notification-count component. Announce live status deliberately without repeating every streamed update.                            |
| [Carousel](https://spartan.ng/components/carousel)       | Root/content/items with previous/next controls; Embla integration.                           | Use for media browsing, not mandatory legal form fields. Verify required Embla packages, keyboard controls, and slide labels. If autoplay is requested, provide pause and respect reduced motion.                                        |
| [Resizable](https://spartan.ng/components/resizable)     | Resizable group/panels/handles, nested groups for axes.                                      | Use for document/list split views. Respect min/max/default sizes and keyboard handles. Decide whether sizes persist; provide a usable narrow-screen arrangement.                                                                         |
| [Scroll Area](https://spartan.ng/components/scroll-area) | Current documented implementation is `ng-scrollbar hlm`/`hlmScrollbar` with `ngx-scrollbar`. | Import the wrapper's dependency and constrain dimensions. Do not invent `<hlm-scroll-area>`. Use ordinary native overflow when custom scrollbar behavior is unnecessary; avoid competing nested scroll regions.                          |

### Utilities and forms guides

| Resource                                                    | Guidance                                                                                                                                                                                                                                           |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Typography](https://spartan.ng/documentation/typography)   | Current examples export class strings such as `hlmH1`, `hlmP`, and `hlmMuted`. Check whether the local version exposes strings or directives before adding anything to `imports`. Use semantic heading levels and preserve the 14px minimum.       |
| [Scroll Fade](https://spartan.ng/documentation/scroll-fade) | Tailwind preset utility, not an Angular component: `scroll-fade`, axis/edge variants. Apply to the actual scroll container; keep frame styling on its wrapper. Verify the preset version and do not obscure focus indicators or required controls. |
| [Shimmer](https://spartan.ng/documentation/shimmer)         | Tailwind preset text effect, not an Angular component. Use sparingly for ongoing status. The reviewed preset handles reduced motion; verify local behavior and keep a readable nonanimated status.                                                 |
| [Reactive Forms](https://spartan.ng/forms/reactive-forms)   | Keep the existing typed forms and use Field labels/descriptions/errors. Current examples support `hlm-field-error validator="required"`; verify local integration and visibility behavior before using it.                                         |
| [Signal Forms](https://spartan.ng/forms/signal-forms)       | A separate supported forms approach in current docs. Check installed Angular/Spartan adapters and use only when requested or already adopted. Do not combine `[formField]`, `formControlName`, and `ngModel` on one control.                       |

## Shared service-driven modal pattern

For reusable create/edit client and case forms, use **modal-only components** opened by a domain service. Calling pages inject the service; they do not include a dialog host in their template. Preserve routed forms elsewhere if a different feature explicitly requires them.

Keep context types in a separate models file to avoid a service/component import cycle. Prefer an object context, and do not use Spartan's internal `$component`/other reserved context keys for domain data.

```ts
// client-form-dialog.models.ts
export interface ClientFormDialogContext {
  clientId?: string;
}
```

```ts
// client-form-dialog.service.ts
import { inject, Injectable } from "@angular/core";
import { Observable } from "rxjs";
import { ClientDetail } from "@law/api-interfaces";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { ClientFormComponent } from "./client-form.component";
import { ClientFormDialogContext } from "./client-form-dialog.models";

@Injectable({ providedIn: "root" })
export class ClientFormDialogService {
  private readonly dialog = inject(HlmDialogService);

  create(): Observable<ClientDetail | undefined> {
    return this.open({});
  }

  edit(clientId: string): Observable<ClientDetail | undefined> {
    return this.open({ clientId });
  }

  private open(context: ClientFormDialogContext): Observable<ClientDetail | undefined> {
    return this.dialog.open<ClientDetail, ClientFormDialogContext>(ClientFormComponent, {
      context,
      contentClass: "sm:max-w-2xl max-h-[90dvh] overflow-y-auto",
    }).closed$;
  }
}
```

The width/scroll classes above are an application composition choice; verify them against the installed content wrapper. If a fixed header/footer is required, use a bounded flex layout with one scrollable body and `min-h-0`; ensure an outer component host does not break that layout.

Inside the modal component, inject the context and the typed reference:

```ts
private readonly context = injectBrnDialogContext<ClientFormDialogContext>();
private readonly dialogRef = inject<BrnDialogRef<ClientDetail>>(BrnDialogRef);
readonly clientId = this.context.clientId;

cancel(): void {
  this.dialogRef.close();
}
```

Import `inject` from Angular and `BrnDialogRef`/`injectBrnDialogContext` from `@spartan-ng/brain/dialog`. The rest of the component keeps the existing typed form and API logic.

- Use `hlm-dialog-header`, an actual heading with `hlmDialogTitle`, and a meaningful translated `hlmDialogDescription`.
- Keep the title mounted during loading. Put `hlm-dialog-footer` inside the form, or connect an external submit button to a unique native form ID.
- **Do not put `hlm-dialog`, `hlm-dialog-content`, `*hlmDialogPortal`, or a dialog trigger inside a component opened through `HlmDialogService`.** The service supplies the wrapper; another dynamic content wrapper can recurse.
- Remove `isDialog` branches, router links, route parameter fallback, and navigation from this modal-only component. Determine create/edit from context, not from the surrounding page's route.
- Validate and guard pending submissions before calling the API. Close with the actual saved `ClientDetail` only after successful persistence. Keep entered data and show errors on failure. Never attach an automatic close directive to Save.
- Cancel/dismissal returns `undefined`. Consumers check `result !== undefined` before updating the list or refetching. Root services must not retain global result Subjects across openings.
- Keep Spartan's supplied close button rather than duplicating it. If dirty/pending state must block dismissal, inspect the installed API and cover Escape, backdrop/outside click, X, Cancel, and programmatic close consistently. Hiding X alone is not a dismissal policy, and `disableClose` should not be assumed to prevent direct `close()` calls.
- The documented Brain reference completes `closed$` after closure. Use a caller's `DestroyRef` when result callbacks must stop as that caller is destroyed. Unsubscribing from `closed$` does not itself close a dialog or undo a submitted request.
- If external programmatic closing is required, return/expose a per-opening typed reference or handle containing `closed$` and `close()`. An observable-only `create()/edit()` API intentionally exposes results only. Do not store an unqualified global “current dialog” that can close the wrong instance.

For a local, declarative dialog only, use the installed root/trigger/portal/content composition. Current docs use `hlmDialogTrigger` and `*hlmDialogPortal`; older projects may have direct Brain directives. Do not mix generations without checking exports.

Sources: [dynamic dialogs](https://spartan.ng/components/dialog#dynamic-component), [reference lifecycle](https://github.com/spartan-ng/spartan/blob/main/libs/brain/dialog/src/lib/brn-dialog-ref.ts).

## Notification counts and status descriptors

Choose the context-specific primitive first:

- Inline status/count: `hlmBadge`.
- Avatar presence indicator: the installed avatar badge component.
- Sidebar menu count: `hlmSidebarMenuBadge`.
- Count over an arbitrary button/icon: compose a relative host and absolutely positioned `hlmBadge`.

A notification overlay is an application pattern built from Badge; do not invent a `hlmNotificationBadge` directive. Use one reusable wrapper if this pattern repeats. Its input contract can include count, maximum display count (e.g. 99), show-zero, and a translated accessible label. Keep the count numeric and nonnegative; use `99+` visually while exposing the actual count in the accessible name. A dot-only indicator needs an equivalent “unread notifications” description.

Example template using a numeric `unreadCount()` signal and a translated `notificationAriaLabel()` value:

```html
<button hlmBtn type="button" variant="outline" class="relative" [attr.aria-label]="notificationAriaLabel()" (click)="openNotifications()">
  {{ 'notifications.title' | translate }} @if (unreadCount() > 0) {
  <span hlmBadge variant="destructive" class="pointer-events-none absolute -top-2 -end-2 text-sm" aria-hidden="true">{{ unreadCount() > 99 ? '99+' : unreadCount() }}</span>
  }
</button>
```

Import the actual badge/button directives or static import groups and the project's translation pipe. `text-sm` preserves this project's 14px requirement under the normal root scale; verify computed size. The logical end position supports RTL. Check that parent overflow does not clip the badge, large values fit, and the button remains the single interactive target. The destructive variant is an available visual choice, not a claim that every unread count is an error; use the chosen design-system variant consistently. Do not add an assertive live region for every count change.

## Forms, lists, and async behavior

### Create/edit forms

Keep required, high-priority fields first. Use Field groups and native fieldsets/legends for meaningful groups; use Collapsible/Accordion for optional details. Preserve the existing client form's controls, validators, dynamic arrays, and translated labels when changing its presentation. Do not rebuild business logic as part of adding dialog chrome.

On invalid submit, mark controls touched, expand sections or activate tabs containing errors, and focus the first reachable invalid control. Keep validation messages near fields. Check whether disabled fields belong in the payload; use `getRawValue()` only when appropriate to the contract. Do not use `form.valid` alone as the only protection against concurrent saves.

For a dropdown with “create new value,” model creation as an explicit action outside the list of real values or through a supported composition. Open a small creation dialog, persist through the API, refresh options, and select the new ID. Do not insert a fake “create” entity ID into the submitted form. Use Combobox for search, and Autocomplete only when free-text behavior is intentional.

### Backend-paginated client/case lists

Use Helm Table for presentation; add TanStack only when its features are needed. Put sorting actions in accessible header buttons and expose the active sort on the corresponding header with `aria-sort`. Keep page, page size, filters, and sorting aligned with backend capabilities. Cancel or ignore stale requests when query state changes. Do not sort/filter only the current page while presenting the result as globally sorted/filtered. Use stable row IDs and keep selection semantics explicit across page changes.

After a successful dialog result, update the visible row if safe or refetch the current query. Recompute/clamp paging if total count changes. Distinguish loading, API failure with retry, no clients at all, and no filtered matches. Display IDs/enums as translated labels without changing their stored values.

### Overlay composition

Exercise nested select/combobox/date-picker menus inside a dialog, especially in long scrolling forms. Check focus containment, pointer dismissal, stacking, and focus restoration after close. Avoid global z-index changes as a first fix. Inspect the installed CDK/Spartan overlay configuration and scoped providers. A dynamic component opened from a root service may need an explicitly supported injector/view-container option to access feature-scoped providers; do not assume the opener's injector is inherited.

## Validation and maintenance

For the changed behavior, run the existing Angular/Nx type/build target and relevant existing tests. Do not add tests that only assert class strings or mirror the implementation. For interaction changes, verify keyboard operation, accessible naming, save/cancel/error paths, loading states, small-screen scrolling, theme/accent switching, and multiple instances when supported. Report honestly when the actual app was unavailable or runtime behavior was not tested.

Common diagnosis rules:

| Symptom                           | Inspect first                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Unknown element/directive         | Installed selector and public export; missing standalone import; outdated example                    |
| Imports not statically analyzable | Correct export, service accidentally in imports, circular imports, package/alias resolution          |
| Dialog recursively renders        | Dynamic component includes another `hlm-dialog-content` wrapper                                      |
| Form closes before saving         | Automatic close directive on submit/action or unguarded dismissal                                    |
| Missing translated selected label | `itemToString`/value template, ID-to-label mapping, locale reactivity                                |
| No value accessor                 | Actual CVA/adapter and correct binding host; do not blindly add `ngDefaultControl`                   |
| Styles missing                    | Tailwind preset/theme imports, generated-source detection, semantic token definitions, local aliases |
| Wrong theme in overlay            | Theme selectors apply to overlay location; CDK root/top-layer configuration                          |
| Footer inaccessible               | Unbounded dialog height, competing scroll containers, invalid external submit association            |
| Badge clipped/misaligned          | Relative containing block, overflow clipping, logical positioning, text size                         |

When refreshing this skill, compare the [component navigation](https://spartan.ng/components/accordion) with the catalog and review [changelog](https://spartan.ng/documentation/changelog), [version support](https://spartan.ng/documentation/version-support), and local generated APIs. Add new families explicitly instead of claiming this dated list is permanently exhaustive. Preserve project decisions while correcting stale examples.

Additional primary references: [configuration](https://spartan.ng/documentation/components-json), [CLI](https://spartan.ng/documentation/cli), [theming](https://spartan.ng/documentation/theming), [RTL](https://spartan.ng/documentation/rtl), [chart source](https://github.com/spartan-ng/spartan/tree/main/libs/helm/chart/src), [chart example](<https://github.com/spartan-ng/spartan/blob/main/apps/app/src/app/pages/(components)/components/(chart)/chart.preview.ts>).
