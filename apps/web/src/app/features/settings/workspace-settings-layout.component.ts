import { Component } from "@angular/core";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "law-workspace-settings-layout",
  standalone: true,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  host: { class: "block min-w-0" },
  template: `
    <div class="px-4 py-6 md:px-8">
      <header class="max-w-4xl">
        <h2 class="text-base font-semibold">
          {{ "settings.organization.title" | translate }}
        </h2>
        <p class="mt-1 text-sm leading-snug text-muted-foreground">
          {{ "settings.organization.description" | translate }}
        </p>
      </header>
      <nav
        class="mt-5 max-w-4xl overflow-x-auto border-b border-border"
        [attr.aria-label]="'settings.organization.navigation' | translate"
      >
        <div class="flex min-w-max gap-1">
          @for (tab of tabs; track tab.path) {
            <a
              class="border-b-2 px-3 py-2 text-sm font-medium hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              [routerLink]="tab.path"
              routerLinkActive
              #activeTab="routerLinkActive"
              [routerLinkActiveOptions]="{ exact: true }"
              [class.border-primary]="activeTab.isActive"
              [class.border-transparent]="!activeTab.isActive"
              [class.bg-accent]="activeTab.isActive"
              [class.text-accent-foreground]="activeTab.isActive"
              [class.text-muted-foreground]="!activeTab.isActive"
              ariaCurrentWhenActive="page"
            >
              {{ tab.label | translate }}
            </a>
          }
        </div>
      </nav>
      <div class="max-w-4xl"><router-outlet /></div>
    </div>
  `,
})
export class WorkspaceSettingsLayoutComponent {
  readonly tabs = [
    { path: "general", label: "settings.organization.tabs.general" },
    { path: "company", label: "settings.organization.tabs.company" },
    { path: "tax", label: "settings.organization.tabs.tax" },
    { path: "sef", label: "settings.organization.tabs.sef" },
    { path: "numbering", label: "settings.organization.tabs.numbering" },
    { path: "payments", label: "settings.organization.tabs.payments" },
    { path: "currencies", label: "settings.organization.tabs.currencies" },
    {
      path: "invoice-defaults",
      label: "settings.organization.tabs.invoiceDefaults",
    },
  ];
}
