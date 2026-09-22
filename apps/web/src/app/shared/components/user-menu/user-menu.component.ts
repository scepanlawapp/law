import {
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { AuthUser } from "@law/api-interfaces";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideChevronDown,
  lucideChevronUp,
  lucideLogOut,
  lucideSettings,
} from "@ng-icons/lucide";
import { HlmDropdownMenuImports } from "@spartan-ng/helm/dropdown-menu";
import { HlmButton } from "@spartan-ng/helm/button";
import { RouterLink } from "@angular/router";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { UserSettingsStore } from "../../../core/user-settings/user-settings.store";

@Component({
  selector: "law-user-menu",
  standalone: true,
  imports: [
    NgIcon,
    ...HlmDropdownMenuImports,
    HlmButton,
    RouterLink,
    TranslatePipe,
    UserAvatarComponent,
  ],
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
  private readonly settingsStore = inject(UserSettingsStore);
  readonly user = input.required<AuthUser>();
  readonly logoutRequested = output<void>();
  readonly menuOpen = signal(false);

  readonly avatarUser = computed(() => this.settingsStore.profile());

  readonly displayName = computed(() => {
    const profile = this.settingsStore.profile();
    if (profile) {
      const full = [profile.firstName, profile.lastName]
        .filter(Boolean)
        .join(" ");
      if (full) return full;
      if (profile.username?.trim()) return profile.username.trim();
    }
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
