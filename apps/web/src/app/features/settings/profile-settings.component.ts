import {
  Component,
  computed,
  DestroyRef,
  effect,
  inject,
  signal,
} from "@angular/core";
import { UserAvatarComponent } from "../../shared/components/user-avatar/user-avatar.component";
import { takeUntilDestroyed, toSignal } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { AuthApiClient, UserSettingsApiClient } from "@law/api-clients";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { AuthState } from "@law/security";
import { UserSettingsStore } from "../../core/user-settings/user-settings.store";
import { HttpClient } from "@angular/common/http";
import { HlmDialogService } from "@spartan-ng/helm/dialog";
import { filter, finalize, switchMap, tap } from "rxjs";
import {
  AvatarCropDialogComponent,
  AvatarCropDialogResult,
  REMOVE_PROFILE_IMAGE,
} from "../../shared/components/user-avatar-drop-dialog/user-avatar-drop-dialog.component";

@Component({
  selector: "law-profile-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    TranslatePipe,
    HlmSpinner,
    UserAvatarComponent,
  ],
  templateUrl: "./profile-settings.component.html",
  styleUrls: ["./settings-pages.component.scss"],
  host: {
    class: "block min-w-0",
  },
})
export class ProfileSettingsComponent {
  private readonly settingsStore = inject(UserSettingsStore);
  private readonly authApi = inject(AuthApiClient);
  private readonly userSettingsApi = inject(UserSettingsApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authState = inject(AuthState);
  private readonly dialogService = inject(HlmDialogService);
  private readonly http = inject(HttpClient);

  readonly profile = this.settingsStore.profile;
  readonly loading = this.settingsStore.loading;
  readonly session = this.authState.session;
  readonly saving = signal(false);
  readonly changingProfileImage = signal(false);

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

  readonly avatarUser = computed(() => {
    const value = this.formValue();

    return {
      firstName: value.firstName ?? "",
      lastName: value.lastName ?? "",
      username: value.username ?? "",
      email: this.profile()?.email ?? "",
      avatarUrl: value.avatarUrl ?? "",
    };
  });
  private readonly formValue = toSignal(this.form.valueChanges, {
    initialValue: this.form.getRawValue(),
  });

  constructor() {
    effect(() => {
      const profile = this.profile();
      if (profile && this.form.pristine) {
        this.form.patchValue({
          firstName: profile.firstName ?? "",
          lastName: profile.lastName ?? "",
          username: profile.username ?? "",
          phone: profile.phone ?? "",
          jobTitle: profile.jobTitle ?? "",
          avatarUrl: profile.avatarUrl ?? "",
        });
      }
    });
  }

  save(): void {
    if (this.saving() || this.changingProfileImage()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    const profile = this.form.getRawValue();
    this.settingsStore
      .update({
        profile: {
          ...profile,
          avatarUrl: profile.avatarUrl?.trim() || undefined,
        },
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.markAsPristine();
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
    this.authApi
      .changePassword(currentPassword, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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

  changeProfileImage(): void {
    if (this.changingProfileImage() || this.saving()) {
      return;
    }

    this.changingProfileImage.set(true);

    const dialogRef = this.dialogService.open(AvatarCropDialogComponent, {
      contentClass: "w-[calc(100vw-2rem)] max-w-lg",
    });

    dialogRef.closed$
      .pipe(
        filter(
          (result): result is AvatarCropDialogResult =>
            result instanceof File || result === REMOVE_PROFILE_IMAGE,
        ),

        switchMap((result) => {
          if (result === REMOVE_PROFILE_IMAGE) {
            return this.userSettingsApi.deleteAvatar();
          }

          const body = new FormData();
          body.append("file", result, result.name);

          return this.userSettingsApi.meAvatar(body);
        }),

        tap(({ avatarUrl }) => {
          if (avatarUrl === null) {
            this.form.controls.avatarUrl.setValue("");
            this.settingsStore.patchProfile({ avatarUrl: null });
            return;
          }

          if (!avatarUrl.trim()) {
            throw new Error("The API did not return an avatar URL.");
          }

          // Refresh the avatar displayed by this component.
          // This preserves unsaved edits and the form's dirty state.
          this.form.controls.avatarUrl.setValue(avatarUrl);

          // Sync the shared store so avatars elsewhere (user menu, etc.) update too.
          this.settingsStore.patchProfile({ avatarUrl });
        }),

        finalize(() => {
          this.changingProfileImage.set(false);
        }),

        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.toast.success(
            this.localization.translate("settings.profileSaved"),
          );
        },
        error: () => {
          this.toast.error(
            this.localization.translate("settings.profileSaveError"),
          );
        },
      });
  }
}
