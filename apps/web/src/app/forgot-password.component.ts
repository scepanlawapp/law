import { Component, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { RouterLink } from "@angular/router";
import { AuthApiClient } from "@law/api-clients";
import { TranslatePipe } from "./core/localization/translate.pipe";

@Component({
  standalone: true,
  imports: [FormsModule, RouterLink, TranslatePipe],
  template: `
    <main class="auth-shell">
      <section class="auth-panel">
        <p class="eyebrow">Law workspace</p>
        <h1>{{ "auth.forgotPassword" | translate }}</h1>
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
          @if (sent()) {
            <p role="status">
              {{ "auth.resetLinkSent" | translate }}
            </p>
          }
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" [disabled]="submitting()">
            {{
              (submitting() ? "auth.sending" : "auth.sendResetLink") | translate
            }}
          </button>
          <a routerLink="/login">{{ "auth.returnToSignIn" | translate }}</a>
        </form>
      </section>
    </main>
  `,
  styles: [
    `
      :host {
        display: block;
        min-height: 100vh;
        background: var(--color-background);
        color: var(--color-text-primary);
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
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        box-shadow: 12px 12px 0 var(--color-border);
      }
      .eyebrow {
        color: var(--color-brand);
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0.5rem 0 2rem;
        font:
          700 2.5rem Georgia,
          serif;
      }
      form {
        display: grid;
        gap: 1rem;
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
        border: 1px solid var(--color-border-strong);
        font: inherit;
      }
      button {
        padding: 0.85rem 1rem;
        border: 0;
        background: var(--color-text-primary);
        color: var(--color-text-inverse);
        font: inherit;
        font-weight: 700;
      }
      a {
        color: var(--color-brand);
      }
      .error {
        color: var(--color-danger);
      }
    `,
  ],
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
