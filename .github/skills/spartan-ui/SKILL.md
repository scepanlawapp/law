---
name: spartan-ui
description: "Use when: scaffolding, styling, adding, or modifying Spartan/UI components, Helm directives, Brain primitives, dialogs, dropdowns, tables, buttons, inputs, or semantic UI elements in Angular 22."
---

# Spartan/UI Guidelines & Component Skill

Spartan/UI is the primary UI component library for the AI-powered Law Office application. It provides headless accessible primitives (`@spartan-ui/brain`) styled with Tailwind CSS directives (`@spartan-ui/helm`).

---

## 1. Spartan/UI Architecture

Spartan/UI is split into two core layers:

1. **Brain (`@spartan-ui/brain`):** Unstyled, accessible primitives built on top of Angular Signals and Angular CDK. Provides state, keyboard navigation, and ARIA roles.
2. **Helm (`@spartan-ui/helm`):** Tailwind-styled standalone components and directives. Exposed directly inside the workspace (under UI components or library paths).

---

## 2. Adding Spartan Components via CLI

To add new Spartan/UI components or Helm directives to the project:

```bash
npx spartan add
```

Or target a specific component directly:

```bash
npx spartan add button
npx spartan add dialog
npx spartan add dropdown-menu
npx spartan add table
npx spartan add input
```

When generated, Spartan places Helm directives into the shared UI library folder. Always reuse generated Helm directives rather than writing custom wrapper components from scratch.

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

### Button Component (`HlmButtonDirective`)

```typescript
import { Component } from "@angular/core";
import { HlmButtonDirective } from "@spartan-ui/helm/button";

@Component({
  selector: "app-law-case-actions",
  standalone: true,
  imports: [HlmButtonDirective],
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

### Dialog Primitive (`HlmDialogComponent` + `@spartan-ui/brain`)

```typescript
import { Component, signal } from "@angular/core";
import { HlmDialogComponent, HlmDialogContentComponent, HlmDialogHeaderComponent, HlmDialogFooterComponent, HlmDialogTitleDirective, HlmDialogDescriptionDirective } from "@spartan-ui/helm/dialog";
import { HlmButtonDirective } from "@spartan-ui/helm/button";
import { BrnDialogContentDirective, BrnDialogTriggerDirective } from "@spartan-ui/brain/dialog";

@Component({
  selector: "app-create-client-dialog",
  standalone: true,
  imports: [HlmDialogComponent, HlmDialogContentComponent, HlmDialogHeaderComponent, HlmDialogFooterComponent, HlmDialogTitleDirective, HlmDialogDescriptionDirective, HlmButtonDirective, BrnDialogContentDirective, BrnDialogTriggerDirective],
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

### Table Component (`HlmTableComponent` + Angular 22 Signals)

```typescript
import { Component, computed, signal } from "@angular/core";
import { HlmTableComponent, HlmTableHeaderDirective, HlmTableRowDirective, HlmTableHeadDirective, HlmTableBodyDirective, HlmTableCellDirective } from "@spartan-ui/helm/table";

interface LegalCase {
  id: string;
  caseNumber: string;
  title: string;
  status: string;
}

@Component({
  selector: "app-case-list",
  standalone: true,
  imports: [HlmTableComponent, HlmTableHeaderDirective, HlmTableRowDirective, HlmTableHeadDirective, HlmTableBodyDirective, HlmTableCellDirective],
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

- [ ] **Check Existing Primitives:** Before writing custom UI elements, check if a Spartan component (`npx spartan add <name>`) exists.
- [ ] **Use Angular Signals:** Bind Spartan component inputs and events using Angular 22 Signals (`signal()`, `computed()`).
- [ ] **Semantic Token Styling:** Ensure all Helm directives use semantic tokens (`bg-primary`, `bg-card`, `text-foreground`, `border-border`, `ring-ring`).
- [ ] **Accessibility:** Maintain ARIA attributes provided by `@spartan-ui/brain`.
- [ ] **Modern Control Flow:** Use `@if`, `@for`, and `@switch` inside templates containing Spartan components.
