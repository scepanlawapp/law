import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import {
  UserSettingsAccent,
  UserSettingsLanguage,
  UserSettingsTheme,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmLabel } from "@spartan-ng/helm/label";
import { HlmRadioGroupImports } from "@spartan-ng/helm/radio-group";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { ThemeService } from "../../core/theme/theme.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  createSelectItemToString,
  type SelectOption,
} from "../../shared/utils";
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  normalizeAccent,
  normalizeTheme,
} from "../../core/theme/theme-options";

@Component({
  selector: "app-appearance-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmLabel,
    HlmRadioGroupImports,
    HlmSelectImports,
    TranslatePipe,
  ],
  templateUrl: "./appearance-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class AppearanceSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly themeOptions: ReadonlyArray<SelectOption<UserSettingsTheme>> = [
    { value: "MIDNIGHT", label: "settings.themeMidnight" },
    { value: "DEEP_NAVY", label: "settings.themeDeepNavy" },
    { value: "CHARCOAL", label: "settings.themeCharcoal" },
    { value: "DARK_TEAL", label: "settings.themeDarkTeal" },
    { value: "BURGUNDY", label: "settings.themeBurgundy" },
    { value: "IVORY", label: "settings.themeIvory" },
  ];
  readonly accentOptions = ACCENT_SWATCHES;
  readonly languageOptions: ReadonlyArray<SelectOption<UserSettingsLanguage>> =
    [
      { value: "SR", label: "settings.serbian" },
      { value: "EN", label: "settings.english" },
    ];
  readonly themeItemToString = createSelectItemToString(
    this.themeOptions,
    (key) => this.localization.translate(key),
  );
  readonly languageItemToString = createSelectItemToString(
    this.languageOptions,
    (key) => this.localization.translate(key),
  );
  readonly form = new FormGroup({
    theme: new FormControl<UserSettingsTheme>(DEFAULT_THEME, {
      nonNullable: true,
    }),
    language: new FormControl<UserSettingsLanguage>("SR", {
      nonNullable: true,
    }),
    accentColor: new FormControl<UserSettingsAccent>(DEFAULT_ACCENT, {
      nonNullable: true,
    }),
  });
  constructor() {
    this.api.get().subscribe({
      next: (s) => {
        this.form.patchValue({
          ...s.preferences,
          theme: normalizeTheme(s.preferences.theme),
          accentColor: normalizeAccent(s.preferences.accentColor),
        });
        this.loading.set(false);
      },
      error: () => {
        this.toast.error(
          this.localization.translate("settings.appearanceLoadError"),
        );
        this.loading.set(false);
      },
    });
  }
  save(): void {
    this.saving.set(true);
    this.api.update({ preferences: this.form.getRawValue() }).subscribe({
      next: async () => {
        await this.localization.setLanguage(this.form.controls.language.value);
        this.theme.apply(
          this.form.controls.theme.value,
          this.form.controls.accentColor.value,
        );
        this.toast.success(
          this.localization.translate("settings.appearanceSaved"),
        );
        this.saving.set(false);
      },
      error: () => {
        this.toast.error(
          this.localization.translate("settings.appearanceSaveError"),
        );
        this.saving.set(false);
      },
    });
  }
}
