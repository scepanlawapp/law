import { DatePipe } from "@angular/common";
import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ChatApiClient } from "@law/api-clients";
import {
  ChatMessageResponse,
  ChatSessionSummary,
  ChatStreamEvent,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { TranslatePipe } from "../../core/localization/translate.pipe";

const MAX_UPLOAD_BYTES = 25_000_000;
const ALLOWED_FILE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
] as const;

const FILE_EXTENSION_MIME_TYPES: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".txt": "text/plain",
};

@Component({
  selector: "app-assistant",
  standalone: true,
  imports: [DatePipe, MatIconModule, ReactiveFormsModule, TranslatePipe],
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
})
export class AssistantComponent implements OnInit {
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private source: EventSource | null = null;

  protected readonly composerForm = new FormGroup({
    draft: new FormControl("", { nonNullable: true }),
  });
  protected readonly sessions = signal<ChatSessionSummary[]>([]);
  protected readonly messages = signal<ChatMessageResponse[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly pendingFiles = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly classifying = signal(false);
  protected readonly error = signal("");

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.source?.close());
    this.loadSessions();
  }

  protected workspaceId(): string | undefined {
    return this.authState.session()?.memberships[0]?.workspaceId;
  }

  protected canSend(): boolean {
    return Boolean(
      this.composerForm.controls.draft.value.trim() ||
      this.pendingFiles().length,
    );
  }

  protected onComposerKeydown(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;

    event.preventDefault();
    this.send();
  }

  protected loadSessions(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.chat.listSessions(workspaceId).subscribe({
      next: (sessions) => {
        this.sessions.set(sessions);
        const selectedSessionId = this.selectedSessionId();
        if (selectedSessionId) {
          const exists = sessions.some(
            (session) => session.id === selectedSessionId,
          );
          if (exists) return;
        }
        const firstSession = sessions[0];
        if (firstSession) this.selectSession(firstSession.id);
      },
      error: () => this.error.set("Unable to load chats."),
    });
  }

  protected createSession(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => {
        this.sessions.update((items) => [session, ...items]);
        this.selectSession(session.id);
      },
      error: () => this.error.set("Unable to create a conversation."),
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
      error: () => this.error.set("Unable to load this conversation."),
    });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    const accepted: File[] = [];
    const rejected: string[] = [];

    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) {
        rejected.push(`File exceeds the 25 MB limit: ${file.name}`);
        continue;
      }

      const mimeType = this.resolveMimeType(file);
      if (!this.isAllowedMimeType(mimeType)) {
        rejected.push(`Unsupported file type: ${file.name}`);
        continue;
      }

      accepted.push(file);
    }

    if (!accepted.length) {
      if (rejected.length) this.error.set(rejected[0]);
      input.value = "";
      return;
    }

    const workspaceId = this.workspaceId();
    const hasSelectedSession = Boolean(this.selectedSessionId());
    if (!hasSelectedSession && workspaceId) {
      this.chat.createSession({ workspaceId }).subscribe({
        next: (session) => {
          this.sessions.update((items) => [session, ...items]);
          this.selectedSessionId.set(session.id);
          this.pendingFiles.set(accepted);
          this.error.set("");
          this.loadSessions();
        },
        error: () => {
          this.error.set("Unable to create a conversation.");
        },
      });
      input.value = "";
      return;
    }

    this.pendingFiles.set(accepted);
    if (rejected.length) this.error.set(rejected[0]);
    input.value = "";
  }

  protected removePendingFile(file: File): void {
    this.pendingFiles.update((items) => items.filter((item) => item !== file));
  }

  protected attachmentUrl(attachmentId: string): string {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return "";
    return this.chat.downloadUrl(workspaceId, attachmentId);
  }

  protected send(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || !this.canSend()) return;

    const sessionId = this.selectedSessionId();
    if (sessionId) {
      this.sendMessage(sessionId);
      return;
    }

    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => {
        this.sessions.update((items) => [session, ...items]);
        this.selectedSessionId.set(session.id);
        this.sendMessage(session.id);
      },
      error: () => {
        this.error.set("Unable to create a conversation.");
      },
    });
  }

  private sendMessage(sessionId: string): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.sending.set(true);
    this.error.set("");
    this.chat
      .sendMessage(
        workspaceId,
        sessionId,
        this.composerForm.controls.draft.value,
        this.pendingFiles(),
      )
      .subscribe({
        next: (response) => {
          this.upsertMessage(response.userMessage);
          this.composerForm.reset();
          this.pendingFiles.set([]);
          this.sending.set(false);
          this.classifying.set(true);
          this.loadSessions();
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
      { withCredentials: true },
    );
    this.source.onmessage = (event) => {
      try {
        this.handleEvent(JSON.parse(event.data) as ChatStreamEvent);
      } catch {
        this.error.set("Received an unreadable chat event.");
      }
    };
    this.source.onerror = () => this.classifying.set(false);
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
      this.error.set(
        event.error ?? "The assistant could not process this message.",
      );
    }
  }

  private upsertMessage(message: ChatMessageResponse): void {
    this.messages.update((items) => {
      if (items.some((item) => item.id === message.id)) return items;
      return [...items, message];
    });
  }

  private isAllowedMimeType(mimeType: string): boolean {
    return ALLOWED_FILE_MIME_TYPES.includes(
      mimeType as (typeof ALLOWED_FILE_MIME_TYPES)[number],
    );
  }

  private resolveMimeType(file: File): string {
    const mimeType = file.type?.trim();
    if (mimeType) return mimeType;

    const lowerName = file.name.toLowerCase();
    const extension = Object.keys(FILE_EXTENSION_MIME_TYPES).find((candidate) =>
      lowerName.endsWith(candidate),
    );
    return extension ? FILE_EXTENSION_MIME_TYPES[extension] : "";
  }
}
