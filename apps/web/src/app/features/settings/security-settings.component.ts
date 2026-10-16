import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmTableImports } from "@spartan-ng/helm/table";
import { AuthApiClient } from "@law/api-clients";
import {
  AuthSessionResponse,
  MfaStatusResponse,
  TrustedDeviceSummary,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { MfaEnrollmentComponent } from "../../auth/mfa/mfa-enrollment.component";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { MemberSecurityComponent } from "./member-security.component";
import { PasswordConfirmDialogService } from "./password-confirm-dialog.service";
import { RecoveryCodesDialogService } from "./recovery-codes-dialog.service";
import { OFFICE_TIME_ZONE } from "../../shared/models";

@Component({
  selector: "law-security-settings",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSpinner,
    HlmTableImports,
    MemberSecurityComponent,
    MfaEnrollmentComponent,
    TranslatePipe,
  ],
  templateUrl: "./security-settings.component.html",
  styleUrls: ["./settings-pages.component.scss"],
  host: { class: "block min-w-0" },
})
export class SecuritySettingsComponent implements OnInit {
  private readonly api = inject(AuthApiClient);
  private readonly authState = inject(AuthState);
  private readonly passwordDialog = inject(PasswordConfirmDialogService);
  private readonly recoveryDialog = inject(RecoveryCodesDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly status = signal<MfaStatusResponse | null>(null);
  readonly loading = signal(true);
  readonly loadFailed = signal(false);
  readonly enrolling = signal(false);
  readonly changingPassword = signal(false);

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

  ngOnInit(): void {
    this.refresh();
  }

  dateLabel(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      timeZone: OFFICE_TIME_ZONE,
      dateStyle: "medium",
    }).format(new Date(value));
  }

  dateTimeLabel(value: string): string {
    return new Intl.DateTimeFormat(this.localization.locale(), {
      timeZone: OFFICE_TIME_ZONE,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  }

  startEnrollment(): void {
    this.enrolling.set(true);
  }

  cancelEnrollment(): void {
    this.enrolling.set(false);
  }

  onEnrollmentCompleted(result: { session?: AuthSessionResponse }): void {
    if (result.session) this.authState.completeLogin(result.session);
    this.enrolling.set(false);
    this.toast.success(this.localization.translate("security.mfaEnabled"));
    this.refresh();
  }

  disable(): void {
    this.passwordDialog
      .open({
        title: "security.disableTitle",
        description: "security.disableDescription",
        confirmText: "security.disable",
        destructive: true,
        run: (password) => this.api.disableMfa(password),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(this.localization.translate("security.mfaDisabled"));
        this.refresh();
      });
  }

  regenerateCodes(): void {
    this.passwordDialog
      .open({
        title: "security.regenerateTitle",
        description: "security.regenerateDescription",
        confirmText: "security.regenerate",
        run: (password) => this.api.regenerateRecoveryCodes(password),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(({ recoveryCodes }) => {
        this.recoveryDialog.open(recoveryCodes);
        this.refresh();
      });
  }

  revokeDevice(device: TrustedDeviceSummary): void {
    this.passwordDialog
      .open({
        title: "security.revokeDeviceTitle",
        description: "security.revokeDeviceDescription",
        confirmText: "security.revoke",
        destructive: true,
        run: (password) => this.api.revokeTrustedDevice(device.id, password),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(
          this.localization.translate("security.deviceRevoked"),
        );
        this.refresh();
      });
  }

  revokeAllDevices(): void {
    this.passwordDialog
      .open({
        title: "security.revokeAllTitle",
        description: "security.revokeAllDescription",
        confirmText: "security.revokeAll",
        destructive: true,
        run: (password) => this.api.revokeTrustedDevices(password),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.toast.success(
          this.localization.translate("security.devicesRevoked"),
        );
        this.refresh();
      });
  }

  changePassword(): void {
    if (this.changingPassword()) return;
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.changingPassword.set(true);
    const { currentPassword, newPassword } = this.passwordForm.getRawValue();
    this.api
      .changePassword(currentPassword, newPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.changingPassword.set(false);
          this.passwordForm.reset();
          this.toast.success(
            this.localization.translate("settings.passwordChanged"),
          );
        },
        error: () => {
          this.changingPassword.set(false);
          this.toast.error(
            this.localization.translate("settings.passwordChangeError"),
          );
        },
      });
  }

  private refresh(): void {
    this.api
      .mfaStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          this.status.set(status);
          this.loadFailed.set(false);
          this.loading.set(false);
        },
        error: () => {
          this.loading.set(false);
          if (this.status() === null) {
            this.loadFailed.set(true);
          } else {
            // Keep showing the last known status after a failed refresh.
            this.toast.error(
              this.localization.translate("security.loadFailed"),
            );
          }
        },
      });
  }
}
