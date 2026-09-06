import { Component, inject } from "@angular/core";
import { AuthState } from "@law/security";

@Component({
  standalone: true,
  template: `
    <main class="workspace-shell">
      <header>
        <div>
          <p class="eyebrow">Law workspace</p>
          <h1>Workspace</h1>
        </div>
        <button type="button" (click)="logout()">Log out</button>
      </header>
      @if (auth.session(); as session) {
        <p>Signed in as {{ session.user.email }}.</p>
      }
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
      .workspace-shell {
        max-width: 64rem;
        margin: auto;
        padding: 3rem 2rem;
      }
      header {
        display: flex;
        justify-content: space-between;
        align-items: start;
        border-bottom: 1px solid #d8d2c5;
        padding-bottom: 1.5rem;
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
      button {
        padding: 0.7rem 1rem;
        border: 1px solid #1e2a28;
        background: transparent;
        color: #1e2a28;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }
    `,
  ],
})
export class AuthenticatedComponent {
  protected readonly auth = inject(AuthState);

  logout(): void {
    this.auth.logout().subscribe();
  }
}
