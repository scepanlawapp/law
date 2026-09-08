import { Component, inject, signal } from "@angular/core";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { UserSettingsApiClient } from "@law/api-clients";
import { AuthApiClient } from "@law/api-clients";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-profile-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    TranslatePipe,
  ],
  templateUrl: "./profile-settings.component.html",
  styleUrl: "./settings-pages.component.scss",
})
export class ProfileSettingsComponent {
  private readonly api = inject(UserSettingsApiClient);
  private readonly authApi = inject(AuthApiClient);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly message = signal("");
  readonly error = signal("");
  readonly form = new FormGroup({
    firstName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(80)],
    }),
    lastName: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(80)],
    }),
    username: new FormControl("", {
      nonNullable: true,
      validators: [Validators.maxLength(50)],
    }),
    phone: new FormControl("", { nonNullable: true }),
    jobTitle: new FormControl("", { nonNullable: true }),
    avatarUrl: new FormControl("", { nonNullable: true }),
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
        this.error.set("settings.profileLoadError");
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
    this.message.set("");
    this.error.set("");
    this.api.update({ profile: this.form.getRawValue() }).subscribe({
      next: () => {
        this.message.set("settings.profileSaved");
        this.saving.set(false);
      },
      error: () => {
        this.error.set("settings.profileSaveError");
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
        this.message.set("settings.passwordChanged");
        this.passwordForm.reset();
      },
      error: () =>
        this.error.set(
          "settings.passwordChangeError",
        ),
    });
  }
}
