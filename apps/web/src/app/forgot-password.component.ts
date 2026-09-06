import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-shell"><section class="auth-panel">
      <p class="eyebrow">Law workspace</p><h1>Reset password</h1>
      <form (ngSubmit)="submit()">
        <label>Email <input name="email" type="email" [(ngModel)]="email" required autocomplete="email"></label>
        @if (sent()) { <p role="status">If the account exists, a reset link has been sent.</p> }
        @if (error()) { <p class="error" role="alert">{{ error() }}</p> }
        <button type="submit" [disabled]="submitting()">{{ submitting() ? "Sending..." : "Send reset link" }}</button>
        <a routerLink="/login">Return to sign in</a>
      </form>
    </section></main>
  `,
  styles: [`
    :host { display: block; min-height: 100vh; background: #f3f0e8; color: #1e2a28; }
    .auth-shell { display: grid; min-height: 100vh; place-items: center; padding: 2rem; }
    .auth-panel { width: min(100%, 28rem); padding: 3rem; background: #fffdf8; border: 1px solid #d8d2c5; box-shadow: 12px 12px 0 #d8d2c5; }
    .eyebrow { color: #9a4f2f; font-size: .75rem; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    h1 { margin: .5rem 0 2rem; font: 700 2.5rem Georgia, serif; }
    form { display: grid; gap: 1rem; } label { display: grid; gap: .4rem; font-weight: 600; }
    input { box-sizing: border-box; width: 100%; padding: .8rem; border: 1px solid #b9b4a9; font: inherit; }
    button { padding: .85rem 1rem; border: 0; background: #1e2a28; color: white; font: inherit; font-weight: 700; }
    a { color: #9a4f2f; } .error { color: #a32626; }
  `],
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
      next: () => { this.sent.set(true); this.submitting.set(false); },
      error: () => { this.error.set("Unable to process the request."); this.submitting.set(false); },
    });
  }
}