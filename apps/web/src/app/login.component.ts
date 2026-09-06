import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router, RouterLink } from "@angular/router";
import { AuthState } from "@law/security";

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <main class="auth-shell">
      <section class="auth-panel">
        <p class="eyebrow">Law workspace</p>
        <h1>Sign in</h1>
        <p class="muted">Use the credentials from your workspace invitation.</p>
        <form (ngSubmit)="submit()">
          <label
            >Email
            <input
              name="email"
              type="email"
              [(ngModel)]="email"
              required
              autocomplete="email"
          /></label>
          <label
            >Password
            <input
              name="password"
              type="password"
              [(ngModel)]="password"
              required
              autocomplete="current-password"
          /></label>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="submitting()">
            {{ submitting() ? "Signing in..." : "Sign in" }}
          </button>
          <a routerLink="/forgot-password">Forgot password?</a>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: #f3f0e8;
        color: #1e2a28;
      }
      .auth-shell {
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 2rem;
      }
      .auth-panel {
        width: min(100%, 28rem);
        padding: 3rem;
        background: #fffdf8;
        border: 1px solid #d8d2c5;
        box-shadow: 12px 12px 0 #d8d2c5;
      }
      .eyebrow {
        color: #9a4f2f;
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0.5rem 0;
        font:
          700 2.5rem Georgia,
          serif;
      }
      .muted {
        color: #62706d;
      }
      form {
        display: grid;
        gap: 1rem;
        margin-top: 2rem;
      }
      label {
        display: grid;
        gap: 0.4rem;
        font-weight: 600;
      }
      input {
        box-sizing: border-box;
        width: 100%;
        padding: 0.8rem;
        border: 1px solid #b9b4a9;
        background: white;
        font: inherit;
      }
      button {
        padding: 0.85rem 1rem;
        border: 0;
        background: #1e2a28;
        color: white;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
      .error {
        color: #a32626;
      }
    `,
  ],
})
export class LoginComponent {
  private readonly auth = inject(AuthState);
  private readonly router = inject(Router);
  email = "";
  password = "";
  readonly error = signal("");
  readonly submitting = signal(false);

  submit(): void {
    this.submitting.set(true);
    this.error.set("");
    this.auth.login(this.email, this.password).subscribe({
      next: () => void this.router.navigate(["/"]),
      error: () => {
        this.error.set("Unable to sign in with those credentials.");
        this.submitting.set(false);
      },
    });
  }
}
