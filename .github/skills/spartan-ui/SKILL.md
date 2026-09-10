---
name: spartan-ui
description: "Use when: scaffolding, styling, adding, or modifying Spartan/UI components, Helm directives, Brain primitives, dialogs, dropdowns, tables, buttons, inputs, or semantic UI elements in Angular 22."
---

# Spartan/UI Guidelines & Component Skill

Spartan/UI is the primary UI component library for the AI-powered Law Office application. It provides headless accessible primitives (`@spartan-ng/brain`, installed as an npm dependency) combined with Tailwind-styled "Helm" component source that the Spartan CLI copies directly into this repo under `libs/shared/frontend/ui/` (import alias `@spartan-ng/helm`). There is no separate `@spartan-ui/helm` npm package to install — Helm code lives in-repo so it can be freely customized.

---

## 1. Spartan/UI Architecture

Spartan/UI is split into two core layers:

1. **Brain (`@spartan-ng/brain`):** Unstyled, accessible primitives (installed to `node_modules`) built on top of Angular Signals and Angular CDK. Provides state, keyboard navigation, and ARIA roles.
2. **Helm (`@spartan-ng/helm/*`):** Tailwind-styled standalone components/directives, copied by the CLI into `libs/shared/frontend/ui/<component>/` as buildable Nx libraries. Edit this code directly — it is part of this repo, not a third-party dependency.

Configuration lives in `components.json` at the repo root:

```json
{
  "componentsPath": "libs/shared/frontend/ui",
  "buildable": true,
  "generateAs": "library",
  "importAlias": "@spartan-ng/helm",
  "style": "nova"
}
```

---

## 2. Adding Spartan Components via CLI

This is an Nx workspace (no `angular.json`), so components are added through the Nx generator runner, not the Angular CLI's `ng g` (which errors with "not available outside a workspace"):

```bash
npx nx g @spartan-ng/cli:ui button
npx nx g @spartan-ng/cli:ui dialog
npx nx g @spartan-ng/cli:ui dropdown-menu
npx nx g @spartan-ng/cli:ui table
npx nx g @spartan-ng/cli:ui input
```

The first run prompts for `buildable`/`generateAs`/`importAlias`/`style` and writes `components.json`; subsequent runs reuse that config. To run fully non-interactively (e.g. in scripts/CI), pass `--buildable=true --generateAs=library --importAlias=@spartan-ng/helm --style=nova --no-interactive` — note these flags only take effect on first use since `components.json` doesn't exist yet; after that, the generator reads from `components.json` directly and does not re-prompt.

When generated, Spartan places Helm directives into `libs/shared/frontend/ui/<component>/`. Always reuse generated Helm directives rather than writing custom wrapper components from scratch — customize the copied Helm source in place instead.

---

## 3. Semantic Tokens & Accent Color Integration

All Spartan/UI Helm directives MUST map directly to the application's **Semantic CSS Custom Properties** rather than static Tailwind colors.

### Token Mapping Matrix

| UI Concept                | Semantic CSS Variable                        | Tailwind Utility Class                       |
| :------------------------ | :------------------------------------------- | :------------------------------------------- |
| Main Page BG              | `--background`                               | `bg-background`                              |
| Text Color                | `--foreground`                               | `text-foreground`                            |
| Card Container            | `--card` / `--card-foreground`               | `bg-card text-card-foreground`               |
| Primary Buttons & Accents | `--primary` / `--primary-foreground`         | `bg-primary text-primary-foreground`         |
| Muted Elements / Hover    | `--muted` / `--muted-foreground`             | `bg-muted text-muted-foreground`             |
| Secondary Actions         | `--secondary` / `--secondary-foreground`     | `bg-secondary text-secondary-foreground`     |
| Accent Highlights         | `--accent` / `--accent-foreground`           | `bg-accent text-accent-foreground`           |
| Destructive Actions       | `--destructive` / `--destructive-foreground` | `bg-destructive text-destructive-foreground` |
| Borders & Inputs          | `--border` / `--input`                       | `border-border bg-transparent`               |
| Focus Rings               | `--ring`                                     | `ring-ring`                                  |

---

## 4. Theme & Accent Color Compatibility

Because Spartan Helm components consume semantic tokens (`bg-primary`, `bg-card`, `border-border`), they automatically adapt when the user switches themes or accent colors:

- **Light/Dark Theme:** Switch via `<html data-theme="light">` or `<html data-theme="dark">`.
- **Accent Color:** Switch via `<html data-accent="blue">`, `<html data-accent="turquoise">`, `<html data-accent="coral">`, or `<html data-accent="purple">`.

Do NOT write dark-mode overrides like `dark:bg-slate-900` inside Spartan Helm classes. Let semantic variables drive theming natively.

---

## 5. Standard Component Patterns

### Button Component (`HlmButton`)

```typescript
import { Component } from "@angular/core";
import { HlmButton } from "@spartan-ng/helm/button";

@Component({
  selector: "app-law-case-actions",
  standalone: true,
  imports: [HlmButton],
  template: `
    <div class="flex items-center gap-3">
      <button hlmBtn variant="default" size="default">Create New Case</button>
      <button hlmBtn variant="secondary">View Details</button>
      <button hlmBtn variant="outline">Export PDF</button>
      <button hlmBtn variant="destructive">Archive Case</button>
    </div>
  `,
})
export class LawCaseActionsComponent {}
```

### Dialog Primitive (`HlmDialogImports` + `@spartan-ng/brain/dialog`)

```typescript
import { Component, signal } from "@angular/core";
import { HlmDialogImports } from "@spartan-ng/helm/dialog";
import { HlmButton } from "@spartan-ng/helm/button";
import { BrnDialogImports } from "@spartan-ng/brain/dialog";

@Component({
  selector: "app-create-client-dialog",
  standalone: true,
  imports: [...HlmDialogImports, HlmButton, ...BrnDialogImports],
  template: `
    <hlm-dialog>
      <button brnDialogTrigger hlmBtn variant="default">Add New Client</button>

      <hlm-dialog-content *brnDialogContent="let ctx">
        <hlm-dialog-header>
          <h3 hlmDialogTitle>New Client Registration</h3>
          <p hlmDialogDescription>Enter client contact and legal details below.</p>
        </hlm-dialog-header>

        <div class="py-4 space-y-4">
          <!-- Form fields using semantic tokens -->
        </div>

        <hlm-dialog-footer>
          <button hlmBtn variant="outline" (click)="ctx.close()">Cancel</button>
          <button hlmBtn variant="default" (click)="saveClient(ctx)">Save Client</button>
        </hlm-dialog-footer>
      </hlm-dialog-content>
    </hlm-dialog>
  `,
})
export class CreateClientDialogComponent {
  saveClient(ctx: { close: () => void }) {
    // Save logic
    ctx.close();
  }
}
```

### Table Component (`HlmTable*` + Angular 22 Signals)

```typescript
import { Component, computed, signal } from "@angular/core";
import { HlmTable, HlmTableHeader, HlmTableRow, HlmTableHead, HlmTableBody, HlmTableCell } from "@spartan-ng/helm/table";

interface LegalCase {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
}

@Component({
  selector: "app-case-list",
  standalone: true,
  imports: [HlmTable, HlmTableHeader, HlmTableRow, HlmTableHead, HlmTableBody, HlmTableCell],
  template: `
    <div class="border border-border rounded-md overflow-hidden bg-card text-card-foreground">
      <hlm-table>
        <hlm-table-header>
          <hlm-table-row>
            <hlm-table-head>Case Number</hlm-table-head>
            <hlm-table-head>Title</hlm-table-head>
            <hlm-table-head>Status</hlm-table-head>
          </hlm-table-row>
        </hlm-table-header>
        <hlm-table-body>
          @for (caseItem of cases(); track caseItem.id) {
            <hlm-table-row>
              <hlm-table-cell class="font-medium">{{ caseItem.caseNumber }}</hlm-table-cell>
              <hlm-table-cell>{{ caseItem.title }}</hlm-table-cell>
              <hlm-table-cell>{{ caseItem.status }}</hlm-table-cell>
            </hlm-table-row>
          } @empty {
            <hlm-table-row>
              <hlm-table-cell colspan="3" class="text-center text-muted-foreground py-6"> No active legal cases found. </hlm-table-cell>
            </hlm-table-row>
          }
        </hlm-table-body>
      </hlm-table>
    </div>
  `,
})
export class CaseListComponent {
  readonly cases = signal<LegalCase[]>([
    { id: "1", caseNumber: "P-102/2026", title: "Marković vs. Grad Beograd", status: "ACTIVE" },
    { id: "2", caseNumber: "K-405/2026", title: "Postupak K-405", status: "IN_REVIEW" },
  ]);
}
```

---

## 6. Spartan/UI Best Practices Checklist

- [ ] **Check Existing Primitives:** Before writing custom UI elements, check if a Spartan component (`npx nx g @spartan-ng/cli:ui <name>`) already exists under `libs/shared/frontend/ui/`.
- [ ] **Use Angular Signals:** Bind Spartan component inputs and events using Angular 22 Signals (`signal()`, `computed()`).
- [ ] **Semantic Token Styling:** Ensure all Helm directives use semantic tokens (`bg-primary`, `bg-card`, `text-foreground`, `border-border`, `ring-ring`).
- [ ] **Accessibility:** Maintain ARIA attributes provided by `@spartan-ng/brain`.
- [ ] **Modern Control Flow:** Use `@if`, `@for`, and `@switch` inside templates containing Spartan components.
- [ ] **Icons:** Use `@ng-icons/core` + `@ng-icons/lucide` (`<ng-icon name="lucideX" />`) instead of `mat-icon`; Spartan ships no icon set of its own.
