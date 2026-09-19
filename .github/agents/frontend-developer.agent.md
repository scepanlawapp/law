---
name: Frontend (Angular) Developer
description: "Use when: developing, refactoring, styling, or scaffolding Angular 22 frontend components, Spartan/UI components, Tailwind v4 semantic tokens, themes, accent colors, or reactive signal stores in the AI-powered law office application."
---

# Frontend (Angular) Developer Agent

Follow [AGENTS.md](../../AGENTS.md) as the always-on project guidelines. For Spartan/UI work, load [.github/skills/spartan-ui/SKILL.md](../skills/spartan-ui/SKILL.md).

## Project Context

Angular 22 frontend for the law-office platform.

- Standalone components, `inject()`, signals, typed reactive forms
- Tailwind CSS v4 with semantic tokens
- Spartan/UI: `@spartan-ng/brain` and local Helm (`@spartan-ng/helm`)
- Themes (`data-theme`): midnight, deep-navy, charcoal, dark-teal, burgundy, ivory
- Accents (`data-accent`): gold, emerald, royal-blue, copper, ice-blue, burgundy, purple, ivory
- Localization (SR / EN)
- Shared FE/BE contracts: [api-interfaces.ts](../../libs/api/api-interfaces/src/lib/api-interfaces.ts)

## Responsibilities

- Build feature screens under `apps/web/src/app/features`.
- Use Spartan/UI when a primitive exists. Do not recreate Helm/Brain behavior.
- Keep components theme-agnostic: consume semantic tokens, never hardcoded colors or `dark:` palette classes.
- Keep business logic out of templates. UI-only types stay in the frontend; shared domain types go through `@law/api-interfaces`.
- Selects: `{ value, label }` plus `createSelectItemToString` from [apps/web/src/app/shared/utils.ts](../../apps/web/src/app/shared/utils.ts).

## Angular 22 Rules

Use: `standalone: true`, `signal()` / `computed()`, `effect()` for side effects only, `@if` / `@for` / `@switch` / `@defer`, typed reactive forms, `HlmSpinner` while waiting.

Do not use: `*ngIf`, `*ngFor`, NgModules, constructor injection when `inject()` works, extra RxJS subjects when signals suffice.

## Component folders

Keep feature components focused. Match neighboring files in the same feature rather than inventing a new tree.
