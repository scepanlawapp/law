# Project Development Guidelines

## Project Overview

This project is an AI-powered law office management application built inside an **Nx Monorepo**.

The application combines:

- Law office management (Cases, Clients, Documents, Tasks, Deadlines, Calendar)
- Business & Financial management
- AI-assisted legal workflows and specialized AI agents

### Tech Stack

- **Frontend:** Angular 22 (Standalone Components, Signals, Reactive Forms, Tailwind CSS v4, Spartan/UI)
- **Backend:** NestJS, Prisma ORM, PostgreSQL
- **Shared Workspace Contracts:** Shared TypeScript API/domain contracts in [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts)

---

## Workspace Architecture & Path Mappings

Organize the application strictly around feature boundaries and domain models within the Nx monorepo:

```text
UI (Spartan/UI Helm & Primitives)
  ↓
Frontend Feature Module (`apps/web/src/app/...`)
  ↓
Angular Service / Signal Store
  ↓
Shared Contracts (`libs/api/api-interfaces/src/lib/api-interfaces.ts`)
  ↓
NestJS Controller (`apps/api/src/app/...`)
  ↓
NestJS Application / Service Layer
  ↓
Prisma Database ORM / File Storage / AI Workflows
```

---

## Workspace Contracts & Type Sharing

- **Shared Types:** All shared TypeScript interfaces, DTOs, type aliases, and enums used across both NestJS backend and Angular 22 frontend MUST be exported from [libs/api/api-interfaces/src/lib/api-interfaces.ts](libs/api/api-interfaces/src/lib/api-interfaces.ts).
- **Modular File Structure:** Keep domain interfaces in modular files under `libs/api/api-interfaces/src/lib/` (e.g., `case.interface.ts`, `client.interface.ts`, `document.interface.ts`) and re-export them cleanly through `api-interfaces.ts`.
- **Technology-Specific Types:** Types, classes, or models used exclusively in the frontend (e.g., UI state, form view-models) or backend (e.g., NestJS request context, local ORM helpers) stay inside their respective application or library folders.

---

## Angular 22 Best Practices

- **Standalone Architecture:** All Angular components, directives, and pipes MUST be `standalone: true`.
- **Reactivity via Signals:**
  - Use `signal()` for state management.
  - Use `computed()` for derived state.
  - Use `effect()` strictly for side-effects.
  - Use `toSignal()` and `toObservable()` when bridging RxJS streams (e.g., HTTP requests).
  - Avoid unnecessary RxJS state subjects when Signals provide a cleaner API.
- **Dependency Injection:** Use the functional `inject()` syntax over constructor injection for cleaner composition.
- **Control Flow:** Use modern Angular control flow syntax (`@if`, `@for`, `@switch`, `@defer`) exclusively. Do NOT use `*ngIf` or `*ngFor`.
- **Forms:** Use typed Reactive Forms for complex legal forms and document inputs.

---

## Styling, Semantic Tokens & Tailwind CSS v4

To support global design changes, theme switching, and accent color customization, component styling MUST rely on **Semantic Tokens**.

### 1. Semantic Tokens Structure

Define design choices as CSS custom properties on the root element. Components consume semantic tokens through Tailwind CSS utility classes rather than hardcoding color values.

Key semantic token roles:

- `--background` / `--foreground`
- `--card` / `--card-foreground`
- `--popover` / `--popover-foreground`
- `--primary` / `--primary-foreground`
- `--secondary` / `--secondary-foreground`
- `--muted` / `--muted-foreground`
- `--accent` / `--accent-foreground`
- `--destructive` / `--destructive-foreground`
- `--border` / `--input` / `--ring`

### 2. Light & Dark Themes

Theming is toggled dynamically via the `data-theme` attribute on the `<html>` root tag:

- `<html data-theme="light">`
- `<html data-theme="dark">`

All semantic variables adapt automatically under `[data-theme='dark']`. Never use hardcoded dark mode utility classes (e.g., `dark:bg-slate-900`) when semantic tokens handle dark mode natively.

### 3. Customizable Accent Colors

Users can select their preferred UI accent color: **blue**, **turquoise** (tirkiz), **coral**, or **purple**.
Accent color switching is driven by the `data-accent` attribute on the `<html>` root tag:

- `<html data-accent="blue">`
- `<html data-accent="turquoise">`
- `<html data-accent="coral">`
- `<html data-accent="purple">`

Changing `data-accent` overrides the `--primary`, `--primary-foreground`, `--ring`, and `--accent` CSS custom properties globally.

---

## Spartan/UI Integration

- **Primary UI Library:** Use **Spartan/UI** primitives and Helm directives as the primary UI library for all frontend components.
- **Headless + Tailwind:** Spartan/UI provides headless accessibility and state signals (`@spartan-ui/brain`) styled with Tailwind CSS directives (`@spartan-ui/helm`).
- **Skill Reference:** Refer to [.github/skills/spartan-ui/SKILL.md](.github/skills/spartan-ui/SKILL.md) whenever scaffolding or styling UI components.
- **Component Reusability:** Keep components small, focused, and token-driven so global theme or accent changes apply seamlessly across the entire legal management platform.
