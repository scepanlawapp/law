import { Component, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmSelectImports } from "@spartan-ng/helm/select";
import { HlmSwitch } from "@spartan-ng/helm/switch";
import { UserSettingsApiClient } from "@law/api-clients";
import { UserSettingsDateTimeFormat } from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";

@Component({
  selector: "app-workspace-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmSelectImports,
    HlmSwitch,
    TranslatePipe,
  ],
  templateUrl: "./workspace-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class WorkspaceSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly form = new FormGroup({
    workspaceNotifications: new FormControl(true, { nonNullable: true }),
    dateTimeFormat: new FormControl<UserSettingsDateTimeFormat>(
      "TWENTY_FOUR_HOUR",
      { nonNullable: true },
    ),
    timeZone: new FormControl("Europe/Belgrade", { nonNullable: true }),
  });
  constructor() {
    this.api.get().subscribe({
      next: (s) => {
        this.form.patchValue(s.preferences);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error(
          this.localization.translate("settings.workspaceLoadError"),
        );
        this.loading.set(false);
      },
    });
  }
  save(): void {
    this.saving.set(true);
    this.api.update({ preferences: this.form.getRawValue() }).subscribe({
      next: () => {
        this.toast.success(
          this.localization.translate("settings.workspaceSaved"),
        );
        this.saving.set(false);
      },
      error: () => {
        this.toast.error(
          this.localization.translate("settings.workspaceSaveError"),
        );
        this.saving.set(false);
      },
    });
  }
}
