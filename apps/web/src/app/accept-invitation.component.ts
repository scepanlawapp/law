import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmField, HlmFieldLabel } from "@spartan-ng/helm/field";
import { HlmInput } from "@spartan-ng/helm/input";
import { TranslatePipe } from "./core/localization/translate.pipe";
import { ToastService } from "./shared/ui/toast/toast.service";

@Component({
  standalone: true,
  imports: [
    FormsModule,
    TranslatePipe,
    HlmButton,
    HlmField,
    HlmFieldLabel,
    HlmInput,
  ],
  template: `
    <main>
      <section>
        <p>Law workspace</p>
        <h1>{{ "auth.acceptInvitation" | translate }}</h1>
        <form (ngSubmit)="submit()">
          <div hlmField>
            <label hlmFieldLabel for="password">Password</label>
            <input
              hlmInput
              id="password"
              name="password"
              type="password"
              [(ngModel)]="password"
              minlength="12"
              required
              autocomplete="new-password"
            />
          </div>
          @if (complete()) {
            <p role="status">{{ "auth.accountReady" | translate }}</p>
          }
          <button hlmBtn type="submit" [disabled]="submitting() || complete()">
            {{
              (submitting() ? "auth.activating" : "auth.setPassword")
                | translate
            }}
          </button>
        </form>
      </section>
    </main>
  `,
})
export class AcceptInvitationComponent {
  private readonly api = inject(AuthApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly toast = inject(ToastService);
  readonly token = this.route.snapshot.queryParamMap.get("token") ?? "";
  password = "";
  readonly complete = signal(false);
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.api
      .acceptInvitation({ token: this.token, password: this.password })
      .subscribe({
        next: () => {
          this.complete.set(true);
          setTimeout(() => void this.router.navigate(["/login"]), 800);
        },
        error: () => {
          this.toast.error("This invitation is invalid or expired.");
          this.submitting.set(false);
        },
      });
  }
}
