import { DatePipe } from "@angular/common";
import { Component, DestroyRef, OnInit, inject, signal } from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { ChatApiClient } from "@law/api-clients";
import { ChatMessageResponse, ChatStreamEvent } from "@law/api-interfaces";
import { AuthState } from "@law/security";

interface Conversation {
  title: string;
  preview: string;
  time: string;
  icon: string;
  group: "Today" | "Yesterday" | "This week";
  active?: boolean;
}

@Component({
  selector: "app-assistant",
  standalone: true,
  imports: [DatePipe, MatIconModule, ReactiveFormsModule],
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
})
export class AssistantComponent implements OnInit {
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private source: EventSource | null = null;

  readonly conversations: Conversation[] = [
    {
      title: "Analysis of case P-123/2026",
      preview: "Here is a summary of the key points in this case...",
      time: "10:24",
      icon: "balance",
      group: "Today",
      active: true,
    },
    {
      title: "Contract analysis",
      preview: "The contract appears to be valid, but there are...",
      time: "09:17",
      icon: "balance",
      group: "Today",
    },
    {
      title: "Client overview - Marko Petrović",
      preview: "Marko Petrović has 4 active cases and 12 total...",
      time: "08:42",
      icon: "group",
      group: "Today",
    },
    {
      title: "Legal research - Commercial disputes",
      preview: "Here are the main legal grounds for a commercial...",
      time: "Yesterday",
      icon: "lightbulb",
      group: "Today",
    },
    {
      title: "Document analysis - Ugovor.pdf",
      preview: "I analyzed the document and extracted the following...",
      time: "16:32",
      icon: "description",
      group: "Yesterday",
    },
    {
      title: "Case strategy - P-124/2026",
      preview: "Based on the available information, I recommend...",
      time: "14:11",
      icon: "balance",
      group: "Yesterday",
    },
    {
      title: "Deadline check",
      preview: "You have 3 upcoming deadlines in the next 7 days...",
      time: "11:03",
      icon: "calendar_month",
      group: "Yesterday",
    },
    {
      title: "Court practice - Appeals",
      preview: "Here are some relevant court decisions for similar cases...",
      time: "Sep 5",
      icon: "balance",
      group: "This week",
    },
    {
      title: "Client communication",
      preview: "Drafted a response to the client regarding the case status...",
      time: "Sep 4",
      icon: "group",
      group: "This week",
    },
  ];

  protected readonly composerForm = new FormGroup({
    draft: new FormControl("", { nonNullable: true }),
  });
  protected readonly messages = signal<ChatMessageResponse[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly pendingFiles = signal<File[]>([]);
  protected readonly sending = signal(false);
  protected readonly classifying = signal(false);
  protected readonly error = signal("");

  readonly conversationGroups = ["Today", "Yesterday", "This week"] as const;

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => this.source?.close());
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.chat.listSessions(workspaceId).subscribe({
      next: (sessions) => {
        const firstSession = sessions[0];
        if (firstSession) this.selectSession(firstSession.id);
      },
      error: () => this.error.set("Unable to load chats."),
    });
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

  protected createSession(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => this.selectSession(session.id),
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
    this.pendingFiles.set(Array.from(input.files ?? []));
  }

  protected send(): void {
    const workspaceId = this.workspaceId();
    const sessionId = this.selectedSessionId();
    if (!workspaceId || !sessionId || !this.canSend()) return;

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
}
