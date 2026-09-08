import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router, RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { TranslatePipe } from "../../core/localization/translate.pipe";

@Component({
  selector: "app-reset-password",
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  templateUrl: "./reset-password.component.html",
  styleUrl: "./reset-password.component.scss",
})
export class ResetPasswordComponent {
  private readonly api = inject(AuthApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly token = this.route.snapshot.queryParamMap.get("token") ?? "";
  password = "";
  readonly complete = signal(false);
  readonly error = signal("");
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api
      .resetPassword({ token: this.token, password: this.password })
      .subscribe({
        next: () => {
          this.complete.set(true);
          setTimeout(() => void this.router.navigate(["/login"]), 1200);
        },
        error: () => {
          this.error.set("This reset link is invalid or expired.");
          this.submitting.set(false);
        },
      });
  }
}
