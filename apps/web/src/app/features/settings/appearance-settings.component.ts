import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import {
  UserSettingsAccent,
  UserSettingsFinish,
  UserSettingsLanguage,
  UserSettingsTheme,
} from "@law/api-interfaces";
import { HlmButton } from "@spartan-ng/helm/button";
import {
  HlmField,
  HlmFieldLabel,
  HlmFieldLegend,
  HlmFieldSet,
} from "@spartan-ng/helm/field";
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
  DEFAULT_FINISH,
  DEFAULT_THEME,
  FINISH_VALUES,
  normalizeAccent,
  normalizeFinish,
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
    HlmFieldLegend,
    HlmFieldSet,
    HlmRadioGroupImports,
    HlmSelectImports,
    TranslatePipe,
  ],
  templateUrl: "./appearance-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
  host: {
    class: "block min-w-0",
  },
})
export class AppearanceSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
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
  readonly finishOptions: ReadonlyArray<UserSettingsFinish> = FINISH_VALUES;
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
    finish: new FormControl<UserSettingsFinish>(DEFAULT_FINISH, {
      nonNullable: true,
    }),
  });
  // The finish picker is only meaningful for the GOLD accent's premium gradients.
  readonly accentColorValue = toSignal(
    this.form.controls.accentColor.valueChanges,
    {
      initialValue: this.form.controls.accentColor.value,
    },
  );
  constructor() {
    this.form.controls.accentColor.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((accentColor) => {
        if (accentColor !== "GOLD") {
          this.form.controls.finish.setValue(DEFAULT_FINISH);
        }
      });
    this.api
      .get()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (s) => {
          this.form.patchValue({
            ...s.preferences,
            theme: normalizeTheme(s.preferences.theme),
            accentColor: normalizeAccent(s.preferences.accentColor),
            finish: normalizeFinish(s.preferences.finish),
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
    this.api
      .update({ preferences: this.form.getRawValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          await this.localization.setLanguage(
            this.form.controls.language.value,
          );
          this.theme.apply(
            this.form.controls.theme.value,
            this.form.controls.accentColor.value,
            this.form.controls.finish.value,
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
