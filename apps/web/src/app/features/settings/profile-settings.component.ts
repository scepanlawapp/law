import { Component, inject, signal } from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { UserSettingsApiClient } from "@law/api-clients";
import { AuthApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";

@Component({
  selector: "app-profile-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    TranslatePipe,
  ],
  templateUrl: "./profile-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class ProfileSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly authApi = inject(AuthApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly form = new FormGroup({
    firstName: new FormControl(""),
    lastName: new FormControl(""),
    username: new FormControl(""),
    phone: new FormControl(""),
    jobTitle: new FormControl(""),
    avatarUrl: new FormControl(""),
  });
  readonly passwordForm = new FormGroup({
    currentPassword: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
    newPassword: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(12)],
    }),
  });

  constructor() {
    this.api.get().subscribe({
      next: (settings) => {
        this.form.patchValue({
          ...settings.profile,
          firstName: settings.profile.firstName ?? "",
          lastName: settings.profile.lastName ?? "",
          username: settings.profile.username ?? "",
          phone: settings.profile.phone ?? "",
          jobTitle: settings.profile.jobTitle ?? "",
          avatarUrl: settings.profile.avatarUrl ?? "",
        });
        this.loading.set(false);
      },
      error: () => {
        this.toast.error(
          this.localization.translate("settings.profileLoadError"),
        );
        this.loading.set(false);
      },
    });
  }

  save(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const profile = this.form.getRawValue();
    this.api
      .update({
        profile: {
          ...profile,
          avatarUrl: profile.avatarUrl?.trim() || undefined,
        },
      })
      .subscribe({
        next: () => {
          this.toast.success(
            this.localization.translate("settings.profileSaved"),
          );
          this.saving.set(false);
        },
        error: () => {
          this.toast.error(
            this.localization.translate("settings.profileSaveError"),
          );
          this.saving.set(false);
        },
      });
  }

  changePassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.authApi.changePassword(currentPassword, newPassword).subscribe({
      next: () => {
        this.passwordForm.reset();
        this.toast.success(
          this.localization.translate("settings.passwordChanged"),
        );
      },
      error: () =>
        this.toast.error(
          this.localization.translate("settings.passwordChangeError"),
        ),
    });
  }
}
