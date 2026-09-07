# Angular Development Guidelines

## Core Stack

- Use **Angular 22**.
- Use **standalone components**. Do not use NgModules for new code.
- Use **Angular Material** for standard UI components whenever a suitable component exists.
- Use **Signals** for reactive local and application state.
- Use **TypeScript strict mode**.
- Avoid `any`. Use explicit types, interfaces, unions, or generics instead.
- Use **Reactive Forms** for forms. Do not use template-driven forms.
- Do not create `.spec.ts` files or tests for now unless explicitly requested.

## Angular Templates

- Use Angular's modern control flow:
  - `@if`
  - `@else`
  - `@for`
  - `@switch`
  - `@case`
  - `@defer`

- Do **not** use legacy structural directives such as `*ngIf` or `*ngFor`.
- Use `track` with `@for` whenever a stable identifier is available.
- Keep templates declarative and simple.
- Do not put business logic in templates.
- Move non-trivial calculations and transformations into TypeScript.
- Prefer computed Signals for derived state.
- Avoid unnecessary subscriptions when Signals or Angular's signal-based APIs can be used.

## Component Architecture

- Every component must have its own folder.
- Every component must use separate files:
  - `.ts`
  - `.html`
  - `.scss`

- Do not create large "god components".
- Keep components focused on a single responsibility.
- Prefer composition of small reusable components over duplicated UI.
- Reusable components should not contain feature-specific business logic.
- Container/page components should coordinate data and state.
- Presentational components should primarily receive data and emit user actions.
- Keep API calls and domain logic outside presentational components.
- Use services for shared behavior, API communication, and application-level state.
- Avoid creating services when simple local component state is sufficient.

## Project Organization

Prefer a feature-oriented structure.

Example:

```text
src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   └── services/
│   │
│   ├── shared/
│   │   ├── components/
│   │   ├── directives/
│   │   └── pipes/
│   │
│   ├── features/
│   │   ├── assistant/
│   │   │   ├── pages/
│   │   │   ├── components/
│   │   │   └── services/
│   │   ├── auth/
│   │   └── ...
│   │
│   ├── app.component.*
│   └── app.routes.ts
│
└── styles/
    ├── _tokens.scss
    ├── _theme.scss
    └── styles.scss
```

- Organize code primarily by **feature/domain**, not by technical type alone.
- `core/` contains application-wide infrastructure.
- `shared/` contains genuinely reusable UI and utilities.
- `features/` contains feature-specific pages, components, services, and state.
- Do not place feature-specific code in `shared/`.
- Do not create generic abstractions until there is a real need for reuse.

## Routing

- Use Angular Router with standalone components.
- Lazy-load feature routes whenever appropriate.
- Keep route configuration close to the feature when practical.
- Protect authenticated routes with appropriate route guards.
- Do not put authorization logic directly inside templates.

## State Management

- Prefer Signals for local component state.
- Use `computed()` for derived state.
- Use `effect()` only for genuine side effects.
- Avoid using `effect()` for state synchronization when `computed()` or explicit event handling is more appropriate.
- Keep state as local as possible.
- Do not introduce a global state-management library unless the application actually requires it.
- Shared state should live in an appropriate service.

## HTTP and Backend Communication

- Keep HTTP/API communication inside dedicated services.
- Do not call `HttpClient` directly from presentational components.
- Define typed request and response models.
- Do not expose backend implementation details directly to UI components.
- Keep domain models language-neutral.
- Never store translated UI strings inside domain models or database entities.
- Handle API errors consistently through shared mechanisms where appropriate.

# UI and Design System

## Angular Material

- Prefer Angular Material components over custom implementations when a suitable Material component exists.
- Use Angular Material for:
  - buttons
  - inputs
  - selects
  - dialogs
  - menus
  - tables
  - tabs
  - cards
  - form controls
  - icons
  - navigation
  - overlays

- Use Angular Material's official theming system.
- Do not globally override Angular Material internals unless absolutely necessary.
- Avoid brittle selectors targeting Material's internal DOM structure.
- Do not recreate Material components with custom HTML/CSS without a strong reason.

## Tailwind CSS

- Tailwind may be used for **layout and utility-level styling**.
- Prefer Tailwind for:
  - flex/grid layouts
  - alignment
  - responsive layout
  - spacing
  - sizing
  - positioning

- Prefer design tokens and component SCSS for:
  - application-specific visual styling
  - custom components
  - complex states
  - reusable visual patterns

- Do not use arbitrary Tailwind values when an existing design token or utility is appropriate.
- Do not mix multiple styling approaches unnecessarily.
- Keep styling predictable and consistent across the application.

## Design Tokens

- Do not hardcode application-wide colors, font sizes, spacing, border radii, or shadows inside components.
- Define reusable design tokens as CSS custom properties in:

```text
src/styles/_tokens.scss
```

- Organize tokens into:
  - Colors
  - Typography
  - Spacing
  - Border radius
  - Shadows
  - Z-index
  - Layout dimensions where appropriate

Use semantic names such as:

```scss
--color-primary
--color-background
--color-surface
--color-surface-hover
--color-text-primary
--color-text-secondary
--color-text-muted
--color-border
--color-error
--color-success

--font-size-xs
--font-size-sm
--font-size-md
--font-size-lg
--font-size-xl

--space-1
--space-2
--space-4
--space-6
--space-8

--radius-sm
--radius-md
--radius-lg

--shadow-sm
--shadow-md
--shadow-lg
```

- Components must consume tokens using:

```scss
var(--token-name)
```

- Avoid arbitrary values such as `17px`, `23px`, or random colors when an existing token can be reused.
- Before creating a new token, check whether an existing token can be reused.
- If a genuinely new reusable visual value is required, add a token instead of creating a one-off value.
- Keep global styles minimal.
- Feature-specific styles belong to the relevant component or feature.

## Theming

- Use Angular Material's official theme configuration for Material components.
- Keep application-specific design tokens separate from Angular Material theme configuration.
- Support light and dark themes through CSS custom properties and theme configuration.
- Do not duplicate component styles for light/dark mode.
- Components should consume semantic tokens rather than knowing the actual color values.
- Never hardcode light-theme or dark-theme colors directly inside individual components.

# Localization

- Use **Angular i18n**.
- Do not introduce third-party localization libraries unless explicitly requested.
- All user-visible text must be localizable.
- Mark static UI text with Angular's `i18n` attribute.

Example:

```html
<h1 i18n="@@welcomeMessage">Welcome to our application!</h1>
```

- Use stable, meaningful custom translation IDs such as:

```text
@@welcomeMessage
@@loginTitle
@@assistantPlaceholder
@@saveButton
```

- Do not use translated text as identifiers.
- Do not concatenate translated strings to construct sentences when proper localization requires a complete translatable message.
- Do not store translated UI text in backend/domain models.
- Default language: **Serbian (Latin script)**.
- English must also be supported.
- New UI text should be written with Serbian Latin as the default user-facing language and have an English translation.
- Do not leave newly created user-visible text in English only.

# Accessibility

- Build accessible UI by default.
- Use semantic HTML where appropriate.
- Prefer native HTML semantics over unnecessary custom behavior.
- Ensure interactive elements are keyboard accessible.
- Provide accessible labels for icon-only buttons and controls.
- Do not rely on color alone to communicate state.
- Use Angular Material accessibility features where available.
- Maintain sufficient visual contrast.

# UX Guidelines

- Prefer simple, predictable interactions.
- Keep visual hierarchy consistent across pages.
- Use consistent spacing, typography, and component behavior.
- Provide appropriate loading, empty, success, and error states.
- Avoid unnecessary animations and visual effects.
- Do not introduce UI patterns that are inconsistent with the existing application.
- Reuse existing components and patterns before creating new ones.

# Code Quality

- Prefer readable code over clever code.
- Keep functions small and focused.
- Use descriptive names.
- Avoid unnecessary abstractions.
- Avoid duplicated business logic.
- Avoid premature optimization.
- Remove unused imports, variables, methods, and styles.
- Do not leave commented-out code.
- Do not introduce dependencies when the Angular platform or existing project dependencies already provide the required functionality.
- Follow existing project conventions before introducing a new pattern.

# Before Creating Code

Before implementing a new component, service, page, or styling pattern:

1. Check whether a suitable existing component or service already exists.
2. Check whether an existing design token can be reused.
3. Check whether Angular Material already provides the required UI.
4. Check whether the functionality belongs to an existing feature.
5. Reuse existing patterns instead of introducing a new architectural approach.

# General Rule

When multiple valid implementations exist, prefer the solution that is:

1. **Simplest**
2. **Most consistent with Angular 22**
3. **Most consistent with the existing project**
4. **Most reusable without unnecessary abstraction**
5. **Most accessible**
6. **Most maintainable**

Do not introduce new libraries, architectural patterns, global styles, or abstractions unless there is a clear benefit.
