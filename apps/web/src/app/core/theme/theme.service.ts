import { DOCUMENT } from "@angular/common";
import { effect, inject, Injectable, signal } from "@angular/core";
import { UserSettingsApiClient } from "@law/api-clients";
import { UserSettingsTheme } from "@law/api-interfaces";
import { AuthState } from "@law/security";

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly authState = inject(AuthState);
  private readonly api = inject(UserSettingsApiClient);
  private loadedUserId: string | null = null;
  readonly theme = signal<UserSettingsTheme>("SYSTEM");

  constructor() {
    effect(() => {
      const userId = this.authState.session()?.user.id ?? null;
      if (userId === this.loadedUserId) return;

      this.loadedUserId = userId;
      if (!userId) {
        this.apply("SYSTEM");
        return;
      }

      this.api.get().subscribe({
        next: (settings) => this.apply(settings.preferences.theme),
      });
    });
  }

  apply(theme: UserSettingsTheme): void {
    this.theme.set(theme);
    this.document.documentElement.dataset["theme"] = theme;
  }
}
