import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { ToastService } from "../../shared/ui/toast/toast.service";

@Component({
  selector: "app-forgot-password",
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
  email = "";
  readonly sent = signal(false);
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api.forgotPassword({ email: this.email }).subscribe({
      next: () => {
        this.sent.set(true);
        this.submitting.set(false);
      },
      error: () => {
        this.toast.error("Unable to process the request.");
        this.submitting.set(false);
      },
    });
  }
}
