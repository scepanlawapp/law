import { Component, computed, inject } from "@angular/core";
import { AuthState } from "@law/security";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideBell,
  lucideDatabase,
  lucidePalette,
  lucideSettings,
  lucideUser,
  lucideWallet,
} from "@ng-icons/lucide";
import { RouterLink, RouterLinkActive, RouterOutlet } from "@angular/router";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { canManageBilling } from "../../shared/billing";

@Component({
  selector: "law-settings",
  standalone: true,
  templateUrl: "./settings.component.html",
  styleUrl: "./settings.component.scss",
  host: {
    class: "block min-w-0 h-full",
  },
  imports: [NgIcon, RouterLink, RouterLinkActive, RouterOutlet, TranslatePipe],
  providers: [
    provideIcons({
      lucideBell,
      lucideDatabase,
      lucidePalette,
      lucideSettings,
      lucideUser,
      lucideWallet,
    }),
  ],
})
export class SettingsComponent {
  private readonly authState = inject(AuthState);

  private readonly canManageBilling = computed(() =>
    canManageBilling(this.authState.activeWorkspace()?.role),
  );

  readonly menu = computed(() => [
    { path: "profile", label: "settings.profile", icon: "lucideUser" },
    { path: "appearance", label: "settings.appearance", icon: "lucidePalette" },
    { path: "workspace", label: "settings.workspace", icon: "lucideBell" },
    ...(this.canManageBilling()
      ? [{ path: "billing", label: "settings.billing", icon: "lucideWallet" }]
      : []),
    { path: "data", label: "settings.data", icon: "lucideDatabase" },
  ]);
}
