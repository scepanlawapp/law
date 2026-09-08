import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-forgot-password",
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: "./forgot-password.component.html",
  styleUrl: "./forgot-password.component.scss",
})
export class ForgotPasswordComponent {
  private readonly api = inject(AuthApiClient);
  email = "";
  readonly sent = signal(false);
  readonly error = signal("");
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api.forgotPassword({ email: this.email }).subscribe({
      next: () => {
        this.sent.set(true);
        this.submitting.set(false);
      },
      error: () => {
        this.error.set("Unable to process the request.");
        this.submitting.set(false);
      },
    });
  }
}
