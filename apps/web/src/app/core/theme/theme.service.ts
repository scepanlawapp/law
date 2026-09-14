import { DOCUMENT } from "@angular/common";
import { effect, inject, Injectable, signal } from "@angular/core";
import { UserSettingsApiClient } from "@law/api-clients";
import { UserSettingsAccent, UserSettingsFinish, UserSettingsTheme } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import {
  DEFAULT_ACCENT,
  DEFAULT_FINISH,
  DEFAULT_THEME,
  normalizeAccent,
  normalizeFinish,
  normalizeTheme,
  toCssAccent,
  toCssFinish,
  toCssTheme,
} from "./theme-options";

@Injectable({ providedIn: "root" })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly authState = inject(AuthState);
  private readonly api = inject(UserSettingsApiClient);
  private loadedUserId: string | null = null;
  readonly theme = signal<UserSettingsTheme>(DEFAULT_THEME);
  readonly accent = signal<UserSettingsAccent>(DEFAULT_ACCENT);
  readonly finish = signal<UserSettingsFinish>(DEFAULT_FINISH);

  constructor() {
    effect(() => {
      const userId = this.authState.session()?.user.id ?? null;
      if (userId === this.loadedUserId) return;

      this.loadedUserId = userId;
      if (!userId) {
        this.apply(DEFAULT_THEME, DEFAULT_ACCENT, DEFAULT_FINISH);
        return;
      }

      this.api.get().subscribe({
        next: (settings) =>
          this.apply(
            settings.preferences.theme,
            settings.preferences.accentColor,
            settings.preferences.finish,
          ),
      });
    });
  }

  apply(
    theme: unknown,
    accent: unknown = DEFAULT_ACCENT,
    finish: unknown = DEFAULT_FINISH,
  ): void {
    const normalizedTheme = normalizeTheme(theme);
    const normalizedAccent = normalizeAccent(accent);
    const normalizedFinish = normalizeFinish(finish);
    this.theme.set(normalizedTheme);
    this.accent.set(normalizedAccent);
    this.finish.set(normalizedFinish);
    this.document.documentElement.dataset["theme"] =
      toCssTheme(normalizedTheme);
    this.document.documentElement.dataset["accent"] =
      toCssAccent(normalizedAccent);
    this.document.documentElement.dataset["finish"] =
      toCssFinish(normalizedFinish);
  }
}
