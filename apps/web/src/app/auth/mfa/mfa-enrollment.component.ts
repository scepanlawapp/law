import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  input,
  output,
  signal,
} from "@angular/core";
import { HttpErrorResponse } from "@angular/common/http";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import {
  FormControl,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from "@angular/forms";
import { RouterLink } from "@angular/router";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { HlmSpinner } from "@spartan-ng/helm/spinner";
import { AuthApiClient } from "@law/api-clients";
import {
  AuthSessionResponse,
  MfaEnrollmentStartResponse,
} from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { isSixDigitCode, pastedCode, stripSpaces } from "./mfa-code";

export type MfaEnrollmentStep = "password" | "scan" | "codes" | "unavailable";

/**
 * Two-factor enrollment, shared by the login challenge (`challenge`, no
 * password) and the signed-in settings screen (`session`, password first).
 */
@Component({
  selector: "law-mfa-enrollment",
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
    HlmSpinner,
    TranslatePipe,
  ],
  templateUrl: "./mfa-enrollment.component.html",
  host: { class: "block" },
})
export class MfaEnrollmentComponent implements OnInit {
  private readonly api = inject(AuthApiClient);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly mode = input<"challenge" | "session">("challenge");
  readonly completed = output<{ session?: AuthSessionResponse }>();

  readonly downloadFileName = "law-recovery-codes.txt";

  readonly passwordForm = new FormGroup({
    currentPassword: new FormControl("", {
      nonNullable: true,
      validators: [Validators.required],
    }),
  });
  readonly codeForm = new FormGroup({
    code: new FormControl("", { nonNullable: true }),
  });

  readonly step = signal<MfaEnrollmentStep>("password");
  readonly start = signal<MfaEnrollmentStartResponse | null>(null);
  readonly recoveryCodes = signal<string[]>([]);
  readonly session = signal<AuthSessionResponse | undefined>(undefined);
  readonly codesSaved = signal(false);
  readonly submitting = signal(false);
  readonly error = signal("");
  readonly secretCopied = signal(false);
  readonly codesCopied = signal(false);

  readonly groupedSecret = computed(
    () =>
      this.start()
        ?.secret.match(/.{1,4}/g)
        ?.join(" ") ?? "",
  );
  readonly canContinue = computed(
    () => this.step() === "codes" && this.codesSaved(),
  );

  ngOnInit(): void {
    if (this.mode() === "challenge") this.startEnrollment(undefined);
    else this.step.set("password");
  }

  submitPassword(): void {
    if (this.passwordForm.invalid) {
      this.passwordForm.markAllAsTouched();
      return;
    }
    this.startEnrollment(this.passwordForm.controls.currentPassword.value);
  }

  codeValid(): boolean {
    return isSixDigitCode(this.codeForm.controls.code.value);
  }

  onCodeInput(): void {
    const control = this.codeForm.controls.code;
    const stripped = stripSpaces(control.value);
    if (stripped !== control.value) control.setValue(stripped);
  }

  onCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    this.codeForm.controls.code.setValue(pastedCode(event, 6));
  }

  confirm(): void {
    if (!this.codeValid()) return;
    this.submitting.set(true);
    this.error.set("");
    this.api
      .confirmMfaEnrollment(stripSpaces(this.codeForm.controls.code.value))
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.recoveryCodes.set(response.recoveryCodes);
          this.session.set(response.session);
          this.start.set(null);
          this.submitting.set(false);
          this.step.set("codes");
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          this.codeForm.controls.code.setValue("");
          this.error.set(
            this.localization.translate(
              error.status === 401
                ? "auth.mfa.codeInvalid"
                : "auth.mfa.setupFailed",
            ),
          );
        },
      });
  }

  copySecret(): void {
    const secret = this.start()?.secret;
    if (!secret) return;
    void this.copy(secret, this.secretCopied);
  }

  copyRecoveryCodes(): void {
    void this.copy(this.recoveryCodes().join("\n"), this.codesCopied);
  }

  recoveryCodesText(now: Date = new Date()): string {
    return [
      this.localization.translate("auth.mfa.downloadHeader"),
      now.toISOString().slice(0, 10),
      "",
      ...this.recoveryCodes(),
      "",
    ].join("\n");
  }

  downloadRecoveryCodes(): void {
    const url = URL.createObjectURL(
      new Blob([this.recoveryCodesText()], { type: "text/plain" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = this.downloadFileName;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  setCodesSaved(saved: boolean): void {
    this.codesSaved.set(saved);
  }

  finish(): void {
    if (!this.canContinue()) return;
    const session = this.session();
    this.completed.emit(session ? { session } : {});
  }

  private startEnrollment(currentPassword: string | undefined): void {
    this.submitting.set(true);
    this.error.set("");
    this.api
      .startMfaEnrollment(currentPassword)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (start) => {
          this.start.set(start);
          this.submitting.set(false);
          this.step.set("scan");
        },
        error: (error: HttpErrorResponse) => {
          this.submitting.set(false);
          if (this.mode() === "challenge" && error.status === 401) {
            this.step.set("unavailable");
          } else {
            this.error.set(
              this.localization.translate(
                error.status === 401
                  ? "auth.mfa.passwordInvalid"
                  : "auth.mfa.setupFailed",
              ),
            );
          }
        },
      });
  }

  private async copy(
    text: string,
    flag: ReturnType<typeof signal<boolean>>,
  ): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      flag.set(true);
      setTimeout(() => flag.set(false), 2000);
    } catch {
      flag.set(false);
    }
  }
}
