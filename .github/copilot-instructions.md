# Angular Development Guidelines

* Use **Angular 22**.
* Use **Angular Material** for UI components and styling where applicable.
* Use **Signals** for reactive state.
* Use the new Angular control flow: `@if`, `@for`, `@switch`, etc. **Do not use** `*ngIf`, `*ngFor`, or similar legacy syntax.
* Use **standalone components**.
* Every component must have its **own folder**.
* Every component must have its own:

  * `.ts` file
  * `.html` file
  * `.scss` file
*  Don't create `.spec.ts` file for now
*  Don't write test for now
* Keep components focused and small. Prefer reusable components over duplicated UI.
* Follow Angular naming and project conventions.
* Prefer Angular Material components over custom implementations when a suitable Material component exists.
* Keep business logic out of templates.
* Use TypeScript strict typing; avoid `any` unless absolutely necessary.
* Write clean, readable, maintainable code. Avoid unnecessary complexity.
* Use Reactive Forms for form handling. Avoid Template-driven forms.
