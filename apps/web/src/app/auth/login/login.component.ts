import { Component, DestroyRef, inject, signal } from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideMail,
  lucideLock,
  lucideEye,
  lucideEyeOff,
  lucideArrowRight,
} from "@ng-icons/lucide";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { AuthApiClient } from "@law/api-clients";
import { MfaMethod } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import {
  isRecoveryCode,
  isSixDigitCode,
  mfaErrorCode,
  pastedCode,
  stripSpaces,
} from "../mfa/mfa-code";

interface FeatureItem {
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: "law-login",
  standalone: true,
  host: {
    class: "block h-full min-h-0 w-full",
  },
  imports: [
    ReactiveFormsModule,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmInputGroupImports,
    HlmSpinner,
    NgIcon,
    TranslatePipe,
    RouterLink,
  ],
  templateUrl: "./login.component.html",
  providers: [
    provideIcons({
      lucideMail,
      lucideLock,
      lucideEye,
      lucideEyeOff,
      lucideArrowRight,
    }),
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthState);
  private readonly api = inject(AuthApiClient);
  private readonly router = inject(Router);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly features: FeatureItem[] = [
    {
      title: "auth.feature.aiAssistant",
      description: "auth.feature.aiAssistantDescription",
      icon: "lucideBot",
    },
    {
      title: "auth.feature.caseManagement",
      description: "auth.feature.caseManagementDescription",
      icon: "lucideFolderOpen",
    },
    {
      title: "auth.feature.documentIntelligence",
      description: "auth.feature.documentIntelligenceDescription",
      icon: "lucideFileText",
    },
    {
      title: "auth.feature.stayOrganized",
      description: "auth.feature.stayOrganizedDescription",
      icon: "lucideCalendar",
    },
  ];

  readonly loginForm = new FormGroup({
    email: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });

  readonly codeForm = new FormGroup({
    code: new FormControl("", { nonNullable: true }),
    rememberDevice: new FormControl(false, { nonNullable: true }),
  });

  readonly step = signal<"password" | "code">("password");
  readonly methods = signal<MfaMethod[]>([]);
  readonly method = signal<MfaMethod>("TOTP");
  readonly emailCodeSent = signal(false);
  readonly notice = signal("");
  readonly error = signal("");
  readonly submitting = signal(false);
  showPassword = false;

  togglePasswordVisibility(): void {
    this.showPassword = !this.showPassword;
  }

  login(): void {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      this.error.set(this.localization.translate("auth.loginFormRequired"));
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.submitting.set(true);
    this.error.set("");
    this.notice.set("");

    this.auth
      .login(email, password)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.submitting.set(false);
          if (response.status === "AUTHENTICATED") {
            void this.router.navigate(["/"]);
          } else if (response.status === "MFA_REQUIRED") {
            this.showCodeStep(response.methods);
          } else {
            void this.router.navigate(["/mfa-setup"]);
          }
        },
        error: (error: HttpErrorResponse) => {
          if (error.status === 401) {
            this.error.set("");
            this.toast.error(
              this.localization.translate("auth.invalidCredentials"),
            );
          } else if (accountThrottled(error)) {
            this.error.set(
              this.localization.translate("auth.mfa.accountThrottled"),
            );
          } else {
            this.error.set(this.localization.translate("auth.loginFailed"));
          }
          this.submitting.set(false);
        },
      });
  }

  canUse(method: MfaMethod): boolean {
    return this.methods().includes(method);
  }

  codeMaxLength(): number {
    return this.method() === "RECOVERY" ? 9 : 6;
  }

  codeValid(): boolean {
    const value = this.codeForm.controls.code.value;
    return this.method() === "RECOVERY"
      ? isRecoveryCode(value)
      : isSixDigitCode(value);
  }

  onCodeInput(): void {
    const control = this.codeForm.controls.code;
    const stripped = stripSpaces(control.value);
    if (stripped !== control.value) control.setValue(stripped);
  }

  onCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.codeForm.controls.code.setValue(
      pastedCode(event, this.codeMaxLength()),
    );
  }

  useRecovery(): void {
    this.switchMethod("RECOVERY");
  }

  useAuthenticator(): void {
    this.switchMethod("TOTP");
  }

  sendEmailCode(): void {
    // The server withholds the e-mail fallback (e.g. after a recent password
    // change); never offer it then.
    if (!this.canUse("EMAIL")) return;
    this.error.set("");
    this.submitting.set(true);
    this.api
      .sendMfaEmailCode()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.submitting.set(false);
          this.emailCodeSent.set(true);
          this.switchMethod("EMAIL", true);
        },
        error: (error: HttpErrorResponse) => this.handleCodeError(error),
      });
  }

  verify(): void {
    if (!this.codeValid()) return;

    const { code, rememberDevice } = this.codeForm.getRawValue();
    this.submitting.set(true);
    this.error.set("");

    this.api
      .verifyMfa({
        method: this.method(),
        code: stripSpaces(code),
        rememberDevice,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.auth.completeLogin(session);
          this.submitting.set(false);
          void this.router.navigate(["/"]);
        },
        error: (error: HttpErrorResponse) => this.handleCodeError(error),
      });
  }

  backToPassword(): void {
    this.resetToPasswordStep();
  }

  private showCodeStep(methods: MfaMethod[]): void {
    this.methods.set(methods);
    this.method.set(methods.includes("TOTP") ? "TOTP" : (methods[0] ?? "TOTP"));
    this.emailCodeSent.set(false);
    this.codeForm.reset({ code: "", rememberDevice: false });
    this.step.set("code");
  }

  private switchMethod(method: MfaMethod, keepSent = false): void {
    this.method.set(method);
    if (!keepSent) this.emailCodeSent.set(false);
    this.codeForm.controls.code.setValue("");
    this.error.set("");
  }

  private handleCodeError(error: HttpErrorResponse): void {
    this.submitting.set(false);
    if (accountThrottled(error)) {
      this.error.set(this.localization.translate("auth.mfa.accountThrottled"));
      return;
    }
    if (error.status === 401 && mfaErrorCode(error) === "MFA_CODE_INVALID") {
      this.error.set(this.localization.translate("auth.mfa.codeInvalid"));
      this.codeForm.controls.code.setValue("");
      return;
    }
    if (error.status === 401) {
      // Expired, locked or consumed challenge (or an unknown 401): the only
      // way forward is a fresh password step.
      this.resetToPasswordStep(
        this.localization.translate("auth.mfa.challengeExpired"),
      );
      return;
    }
    this.error.set(this.localization.translate("auth.loginFailed"));
  }

  private resetToPasswordStep(notice = ""): void {
    this.loginForm.controls.password.setValue("");
    this.codeForm.reset({ code: "", rememberDevice: false });
    this.error.set("");
    this.notice.set(notice);
    this.step.set("password");
  }
}

/** Too many failed second-factor checks on this account (server R7). */
function accountThrottled(error: HttpErrorResponse): boolean {
  return (
    error.status === 429 && mfaErrorCode(error) === "MFA_ACCOUNT_THROTTLED"
  );
}
