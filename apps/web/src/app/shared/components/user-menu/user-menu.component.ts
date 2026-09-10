import { Component, computed, input, output, signal } from "@angular/core";
import { AuthUser } from "@law/api-interfaces";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideLogOut,
  lucideSettings,
} from "@ng-icons/lucide";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { RouterLink } from "@angular/router";
import { TranslatePipe } from "../../../core/localization/translate.pipe";

@Component({
  selector: "app-user-menu",
  standalone: true,
  imports: [NgIcon, ...HlmDropdownMenuImports, RouterLink, TranslatePipe],
  templateUrl: "./user-menu.component.html",
  providers: [
    provideIcons({
      lucideChevronDown,
      lucideChevronUp,
      lucideLogOut,
      lucideSettings,
    }),
  ],
})
export class UserMenuComponent {
  readonly user = input.required<AuthUser>();
  readonly logoutRequested = output<void>();
  readonly menuOpen = signal(false);

  readonly displayName = computed(() => {
    const user = this.user();
    if (user.name?.trim()) return user.name.trim();

    return (user.email.split("@", 1)[0] || "user")
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");
  });

  readonly initials = computed(() => {
    const parts = this.displayName().split(/\s+/).filter(Boolean);
    if (parts.length > 1) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }

    return this.displayName().slice(0, 2).toUpperCase();
  });
}
