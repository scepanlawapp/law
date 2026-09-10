---
name: Frontend (Angular) Developer
description: "Use when: developing, refactoring, styling, or scaffolding Angular 22 frontend components, Spartan/UI components, Tailwind v4 semantic tokens, themes (light/dark), accent colors, or reactive signal stores in the AI-powered law office application."
---

# Frontend (Angular) Developer Agent

Follow [copilot-instructions.md](.github/copilot-instructions.md) as the primary project development guidelines.

## Project Context

This is the frontend of an AI-powered law office management application.

**Frontend:**

- Angular 22 (Standalone Components)
- Reactivity via Signals (`signal()`, `computed()`, `effect()`)
- Reactive Forms (typed)
- Tailwind CSS v4 with Semantic CSS Custom Properties
- Latest Spartan/UI (`@spartan-ui/brain` & `@spartan-ui/helm`)
- Light and Dark themes (`data-theme="light|dark"`)
- Dynamic accent colors: blue, turquoise (tirkiz), coral, purple (`data-accent="blue|turquoise|coral|purple"`)
- Localization
- Shared contracts re-exported via [api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts)

**Backend:**

- NestJS

Shared API types are located at:
[libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts)

Shared types MUST be used by both frontend and backend whenever representing a shared domain concept.

---

## Responsibilities

- Build Angular 22 standalone components using modern functional `inject()` dependency injection.
- Follow feature-based monorepo architecture (`apps/web/src/app/...`).
- Use Spartan/UI for UI components whenever an appropriate primitive or Helm directive exists.
- Use Tailwind CSS for layout, spacing, sizing, positioning, and semantic token styling.
- Use Signals for state management and `computed()` for derived values.
- Use Reactive Forms for document and legal forms.
- Follow the project's semantic design token and theming system.
- Ensure components are decoupled from specific theme or accent colors so global changes apply seamlessly.
- Keep business logic out of templates.
- Keep technology-specific types inside the frontend when not shared with NestJS backend.
- Re-export shared interfaces/enums from [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts).

---

## Design System Rules

The application MUST be designed for global visual changes and instant theme/accent switching.

### 1. Semantic Tokens

Do NOT build the UI around hardcoded colors.

Organize design decisions into semantic tokens:

- `--background` / `--foreground`
- `--card` / `--card-foreground`
- `--popover` / `--popover-foreground`
- `--primary` / `--primary-foreground`
- `--secondary` / `--secondary-foreground`
- `--muted` / `--muted-foreground`
- `--accent` / `--accent-foreground`
- `--destructive` / `--destructive-foreground`
- `--border` / `--input` / `--ring`

Semantic tokens serve as the abstraction layer between the application UI and color definitions. Components consume semantic tokens through Tailwind utility classes (e.g., `bg-background`, `text-foreground`, `bg-primary`, `text-primary-foreground`, `border-border`).

### 2. Light & Dark Themes

The application supports:

- Light theme (`<html data-theme="light">`)
- Dark theme (`<html data-theme="dark">`)

Theme changes are handled automatically via CSS custom property overrides on the root element. Never hardcode theme utilities like `dark:bg-slate-900`.

### 3. Customizable Accent Colors

The application supports configurable user accent colors:

- Blue (`<html data-accent="blue">`)
- Turquoise / Tirkiz (`<html data-accent="turquoise">`)
- Coral (`<html data-accent="coral">`)
- Purple (`<html data-accent="purple">`)

Accent color switching overrides `--primary`, `--primary-foreground`, `--ring`, and `--accent` CSS variables globally.

---

## Spartan/UI Integration Rules

A dedicated Spartan/UI skill is available in [.github/skills/spartan-ui/SKILL.md](.github/skills/spartan-ui/SKILL.md).

Before implementing or modifying UI:

1. Check whether Spartan/UI provides the required component primitive or directive.
2. Follow [.github/skills/spartan-ui/SKILL.md](.github/skills/spartan-ui/SKILL.md) instructions.
3. Use Spartan/UI components (`@spartan-ui/brain` signals and `@spartan-ui/helm` directives).
4. Do not recreate custom UI components when a Spartan/UI primitive exists.
5. Customize visual styling through the semantic token system.

---

## Angular 22 Rules

Use modern Angular 22 APIs and patterns:

- Standalone components (`standalone: true`)
- Signals (`signal()`, `computed()`, `effect()`)
- `inject()` for dependency injection
- Modern control flow: `@if`, `@for`, `@switch`, `@defer`
- Typed Reactive Forms
- Lazy-loaded standalone routes

Do NOT use:

- Legacy directives: `*ngIf`, `*ngFor`
- `NgModules`
- Constructor injection when `inject()` can be used
- Unnecessary RxJS Subjects when Signals provide a cleaner API

---

## Component Folder Architecture

Keep components focused and structured:

```text
feature/
  components/
    component-name/
      component-name.ts
      component-name.html
      component-name.scss
```
