import { Component, DestroyRef, effect, inject, signal } from "@angular/core";
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
import { LocalizationService } from "../../core/localization/localization.service";
import { ThemeService } from "../../core/theme/theme.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { UserSettingsStore } from "../../core/user-settings/user-settings.store";
import {
  ACCENT_SWATCHES,
  DEFAULT_ACCENT,
  DEFAULT_FINISH,
  DEFAULT_THEME,
  normalizeAccent,
  normalizeFinish,
  normalizeTheme,
  THEME_SWATCHES,
} from "../../core/theme/theme-options";
import {
  ACCENT_LABELS,
  createSelectItemToString,
  DEFAULT_LANGUAGE,
  FINISH_LABELS,
  LANGUAGE_LABELS,
  optionsFrom,
  THEME_LABELS,
} from "../../shared/models";
import { ACCENT_CSS_VALUES, FINISH_CSS_VALUES } from "../../shared/models";

@Component({
  selector: "law-appearance-settings",
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
  private readonly settingsStore = inject(UserSettingsStore);
  private readonly localization = inject(LocalizationService);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  readonly preferences = this.settingsStore.preferences;
  readonly loading = this.settingsStore.loading;
  readonly saving = signal(false);
  readonly UserSettingsAccent = UserSettingsAccent;
  readonly themeOptions = optionsFrom(THEME_LABELS);
  readonly themeSwatches = THEME_SWATCHES;
  readonly accentOptions = optionsFrom(ACCENT_LABELS);
  readonly accentSwatches = ACCENT_SWATCHES;
  readonly finishOptions = optionsFrom(FINISH_LABELS);
  readonly finishCssValues = FINISH_CSS_VALUES;
  readonly goldCssValue = ACCENT_CSS_VALUES[UserSettingsAccent.GOLD];
  readonly languageOptions = optionsFrom(LANGUAGE_LABELS);
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
    language: new FormControl<UserSettingsLanguage>(DEFAULT_LANGUAGE, {
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
        if (accentColor !== UserSettingsAccent.GOLD) {
          this.form.controls.finish.setValue(DEFAULT_FINISH);
        }
      });

    effect(() => {
      const preferences = this.preferences();
      if (preferences && this.form.pristine) {
        this.form.patchValue({
          ...preferences,
          theme: normalizeTheme(preferences.theme),
          accentColor: normalizeAccent(preferences.accentColor),
          finish: normalizeFinish(preferences.finish),
        });
      }
    });
  }
  save(): void {
    this.saving.set(true);
    this.settingsStore
      .update({ preferences: this.form.getRawValue() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          this.form.markAsPristine();
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
