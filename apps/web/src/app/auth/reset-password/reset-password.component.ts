import { Component, DestroyRef, inject, signal } from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { LocalizationService } from "../../core/localization/localization.service";

@Component({
  selector: "law-reset-password",
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
  templateUrl: "./reset-password.component.html",
})
export class ResetPasswordComponent {
  private readonly api = inject(AuthApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  private readonly localization = inject(LocalizationService);
  private readonly destroyRef = inject(DestroyRef);
  readonly token = this.route.snapshot.queryParamMap.get("token") ?? "";
  password = "";
  readonly complete = signal(false);
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api
      .resetPassword({ token: this.token, password: this.password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.complete.set(true);
          setTimeout(() => void this.router.navigate(["/login"]), 1200);
        },
        error: () => {
          this.toast.error(this.localization.translate("auth.resetLinkInvalid"));
          this.submitting.set(false);
        },
      });
  }
}
