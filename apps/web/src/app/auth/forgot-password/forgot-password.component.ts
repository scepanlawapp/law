import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { LocalizationService } from "../../core/localization/localization.service";

@Component({
  selector: "law-forgot-password",
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    TranslatePipe,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
  ],
  templateUrl: "./forgot-password.component.html",
})
export class ForgotPasswordComponent {
  private readonly api = inject(AuthApiClient);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  email = "";
  readonly sent = signal(false);
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api
      .forgotPassword({ email: this.email })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.sent.set(true);
          this.submitting.set(false);
        },
        error: () => {
          this.toast.error(this.localization.translate("auth.requestFailed"));
          this.submitting.set(false);
        },
      });
  }
}
