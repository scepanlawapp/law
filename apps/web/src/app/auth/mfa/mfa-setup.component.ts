import { Component, inject } from "@angular/core";
import { Router } from "@angular/router";
import { AuthSessionResponse } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { MfaEnrollmentComponent } from "./mfa-enrollment.component";

/**
 * Route wrapper for office-required enrollment at login: reachable without a
 * session, it continues on the challenge cookie set by the password step.
 */
@Component({
  selector: "law-mfa-setup",
  standalone: true,
  imports: [MfaEnrollmentComponent, TranslatePipe],
  host: { class: "block h-full min-h-0 w-full" },
  template: `
    <main
      class="bg-background flex h-full min-h-0 w-full items-start justify-center overflow-y-auto px-6 py-10"
    >
      <div class="w-full max-w-md">
        <h1 class="text-xl font-semibold">
          {{ "auth.mfa.setupTitle" | translate }}
        </h1>
        <p class="text-muted-foreground mt-2 mb-6 text-sm leading-snug">
          {{ "auth.mfa.setupRequiredDescription" | translate }}
        </p>
        <law-mfa-enrollment
          mode="challenge"
          (completed)="onCompleted($event)"
        />
      </div>
    </main>
  `,
})
export class MfaSetupComponent {
  private readonly auth = inject(AuthState);
  private readonly router = inject(Router);

  onCompleted(result: { session?: AuthSessionResponse }): void {
    if (result.session) {
      this.auth.completeLogin(result.session);
      void this.router.navigate(["/"]);
    } else {
      void this.router.navigate(["/login"]);
    }
  }
}
