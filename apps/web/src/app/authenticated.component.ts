import { Component, DestroyRef, inject, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ChatApiClient } from "@law/api-clients";
import {
  ChatMessageResponse,
  ChatSessionSummary,
  ChatStreamEvent,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";

@Component({
  standalone: true,
  imports: [FormsModule],
  template: `
    <main class="chat-shell">
      <aside>
        <div class="aside-head">
          <p class="eyebrow">Stojković</p>
          <h1>Chat</h1>
        </div>
        <button
          type="button"
          class="primary"
          (click)="createSession()"
          [disabled]="!workspaceId()"
        >
          New chat
        </button>
        <ul>
          @for (item of sessions(); track item.id) {
            <li>
              <button
                type="button"
                class="session"
                [class.active]="item.id === selectedSessionId()"
                (click)="selectSession(item.id)"
              >
                {{ item.title || "Untitled" }}
              </button>
            </li>
          }
        </ul>
        @if (auth.session(); as session) {
          <p class="muted signed-in">{{ session.user.email }}</p>
        }
        <button type="button" class="ghost" (click)="logout()">Log out</button>
      </aside>
      <section class="transcript-pane">
        @if (!selectedSessionId()) {
          <p class="empty">Start a chat to send a legal intake request.</p>
        } @else {
          <div class="messages">
            @for (message of messages(); track message.id) {
              <article [class]="message.role.toLowerCase()">
                <p>{{ message.content }}</p>
                @if (message.attachments.length) {
                  <ul class="chips">
                    @for (file of message.attachments; track file.id) {
                      <li>{{ file.originalName }}</li>
                    }
                  </ul>
                }
              </article>
            }
            @if (classifying()) {
              <p class="status">Portir is reviewing…</p>
            }
            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
          </div>
          <form (ngSubmit)="send()">
            @if (pendingFiles().length) {
              <ul class="chips">
                @for (file of pendingFiles(); track file.name + file.size) {
                  <li>{{ file.name }}</li>
                }
              </ul>
            }
            <textarea
              name="draft"
              rows="3"
              [(ngModel)]="draft"
              placeholder="Describe the legal matter…"
              [disabled]="sending()"
            ></textarea>
            <div class="composer-actions">
              <label class="attach">
                Attach
                <input type="file" multiple (change)="onFiles($event)" />
              </label>
              <button
                type="submit"
                [disabled]="sending() || classifying() || !canSend()"
              >
                {{ sending() ? "Sending…" : "Send" }}
              </button>
            </div>
          </form>
        }
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
      .chat-shell {
        display: grid;
        grid-template-columns: 18rem 1fr;
        min-height: 100vh;
      }
      aside {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        padding: 1.5rem;
        border-right: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      .eyebrow {
        color: var(--color-brand);
        font-size: 0.75rem;
        font-weight: 700;
        letter-spacing: 0.12em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0.4rem 0 0;
        font:
          700 1.8rem Georgia,
          serif;
      }
      ul {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 0.4rem;
        flex: 1;
        overflow: auto;
      }
      button {
        font: inherit;
        cursor: pointer;
      }
      .primary,
      form button {
        padding: 0.75rem 1rem;
        border: 0;
        background: var(--color-text-primary);
        color: var(--color-text-inverse);
        font-weight: 700;
      }
      .ghost {
        padding: 0.7rem 1rem;
        border: 1px solid var(--color-text-primary);
        background: transparent;
        font-weight: 700;
      }
      .session {
        width: 100%;
        text-align: left;
        padding: 0.7rem;
        border: 1px solid transparent;
        background: transparent;
      }
      .session.active {
        border-color: var(--color-border);
        background: var(--color-background);
      }
      .muted,
      .empty,
      .status {
        color: var(--color-text-muted);
      }
      .transcript-pane {
        display: grid;
        grid-template-rows: 1fr auto;
        min-height: 100vh;
      }
      .messages {
        padding: 2rem;
        display: grid;
        gap: 1rem;
        align-content: start;
        overflow: auto;
      }
      article {
        max-width: 42rem;
        padding: 1rem 1.1rem;
        border: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      article.user {
        justify-self: end;
        background: var(--color-surface);
      }
      article p {
        margin: 0;
        white-space: pre-wrap;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 0.4rem;
        margin-top: 0.6rem;
      }
      .chips li {
        padding: 0.2rem 0.5rem;
        border: 1px solid var(--color-border);
        font-size: 0.8rem;
      }
      form {
        display: grid;
        gap: 0.75rem;
        padding: 1.5rem 2rem 2rem;
        border-top: 1px solid var(--color-border);
        background: var(--color-surface);
      }
      textarea {
        width: 100%;
        box-sizing: border-box;
        padding: 0.8rem;
        border: 1px solid var(--color-border-strong);
        font: inherit;
      }
      .composer-actions {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .attach input {
        display: none;
      }
      .error {
        color: var(--color-danger);
      }
      button:disabled {
        opacity: 0.6;
        cursor: wait;
      }
    `,
  ],
})
export class AuthenticatedComponent implements OnInit {
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly auth = this.authState;

  protected draft = "";
  protected readonly sessions = signal<ChatSessionSummary[]>([]);
  protected readonly messages = signal<ChatMessageResponse[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly pendingFiles = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly classifying = signal(false);
  protected readonly error = signal("");
  private source: EventSource | null = null;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.source?.close());
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    this.chat.listSessions(workspaceId).subscribe({
      next: (sessions) => this.sessions.set(sessions),
      error: () => this.error.set("Unable to load chats."),
    });
  }

  protected workspaceId(): string | undefined {
    return this.authState.session()?.memberships[0]?.workspaceId;
  }

  protected canSend(): boolean {
    return Boolean(this.draft.trim() || this.pendingFiles().length);
  }

  protected logout(): void {
    this.authState.logout().subscribe();
  }

  protected createSession(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => {
        this.sessions.update((items) => [session, ...items]);
        this.selectSession(session.id);
      },
      error: () => this.error.set("Unable to create a chat."),
    });
  }

  protected selectSession(sessionId: string): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    this.selectedSessionId.set(sessionId);
    this.error.set("");
    this.classifying.set(false);
    this.chat.getSession(workspaceId, sessionId).subscribe({
      next: (detail) => {
        this.messages.set(detail.messages);
        const lastMessage = detail.messages[detail.messages.length - 1];
        this.listen(sessionId, lastMessage?.createdAt);
      },
      error: () => this.error.set("Unable to load this chat."),
    });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.pendingFiles.set(Array.from(input.files ?? []));
  }

  protected send(): void {
    const workspaceId = this.workspaceId();
    const sessionId = this.selectedSessionId();
    if (!workspaceId || !sessionId || !this.canSend()) return;
    this.sending.set(true);
    this.error.set("");
    this.chat
      .sendMessage(workspaceId, sessionId, this.draft, this.pendingFiles())
      .subscribe({
        next: (response) => {
          this.upsertMessage(response.userMessage);
          this.draft = "";
          this.pendingFiles.set([]);
          this.sending.set(false);
          this.classifying.set(true);
        },
        error: () => {
          this.sending.set(false);
          this.error.set("Unable to send that message.");
        },
      });
  }

  private listen(sessionId: string, after?: string): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    this.source?.close();
    this.source = new EventSource(
      this.chat.eventsUrl(workspaceId, sessionId, after),
      {
        withCredentials: true,
      },
    );
    this.source.onmessage = (event) => {
      try {
        this.handleEvent(JSON.parse(event.data) as ChatStreamEvent);
      } catch {
        this.error.set("Received an unreadable chat event.");
      }
    };
    this.source.onerror = () => {
      this.classifying.set(false);
    };
  }

  private handleEvent(event: ChatStreamEvent): void {
    if (event.type === "message.created" && event.message) {
      this.upsertMessage(event.message);
      if (event.message.role === "ASSISTANT") this.classifying.set(false);
    }
    if (event.type === "triage.started") this.classifying.set(true);
    if (event.type === "triage.completed" || event.type === "job.queued") {
      this.classifying.set(false);
    }
    if (event.type === "error") {
      this.classifying.set(false);
      this.error.set(event.error ?? "Portir could not classify this message.");
    }
  }

  private upsertMessage(message: ChatMessageResponse): void {
    this.messages.update((items) => {
      if (items.some((item) => item.id === message.id)) return items;
      return [...items, message];
    });
  }
}
