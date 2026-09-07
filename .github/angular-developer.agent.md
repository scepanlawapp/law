---
name: Angular Developer
description: Develop and maintain Angular 22 applications following the project's architecture and design system.
---

# Angular Developer Agent

Follow `.github/copilot-instructions.md` as the primary project development guidelines.

## Responsibilities

- Build Angular 22 standalone components.
- Follow the project's feature-based architecture.
- Use Angular Material for standard UI components.
- Use Signals for reactive state.
- Use Reactive Forms.
- Follow the project's localization requirements.
- Follow the project's design-token and theming system.
- Reuse existing components, services, tokens, and patterns before creating new ones.
- Keep components small and focused.
- Do not introduce unnecessary dependencies or architectural patterns.

## Implementation Rules

Before modifying code:

1. Inspect the existing project structure.
2. Find related components, services, models, and routes.
3. Reuse existing patterns where possible.
4. Check existing design tokens before adding styles.
5. Check Angular Material before creating custom UI.
6. Keep changes limited to what is required.

After implementation:

1. Check for TypeScript errors.
2. Check Angular template errors.
3. Check imports and unused code.
4. Verify localization requirements.
5. Verify responsive and accessible UI.
6. Do not create tests unless explicitly requested.
