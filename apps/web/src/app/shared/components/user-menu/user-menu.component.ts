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
import { HlmSidebarMenuButton } from "@spartan-ng/helm/sidebar";
import { RouterLink } from "@angular/router";
import { TranslatePipe } from "../../../core/localization/translate.pipe";
import { LocalizationService } from "../../../core/localization/localization.service";
import { UserAvatarComponent } from "../user-avatar/user-avatar.component";
import { UserSettingsStore } from "../../../core/user-settings/user-settings.store";

@Component({
  selector: "law-user-menu",
  standalone: true,
  host: { class: "block min-w-0" },
  imports: [
    NgIcon,
    ...HlmDropdownMenuImports,
    HlmSidebarMenuButton,
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
  private readonly localization = inject(LocalizationService);
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

    const local = user.email.split("@", 1)[0];
    if (!local) return this.localization.translate("userAvatar.unknownUser");
    return local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part[0].toUpperCase() + part.slice(1))
      .join(" ");
  });
}
