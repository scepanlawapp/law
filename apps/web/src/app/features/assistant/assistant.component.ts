import { DatePipe } from "@angular/common";
import {
  Component,
  ChangeDetectionStrategy,
  DestroyRef,
  ElementRef,
  AfterViewInit,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatTooltipModule } from "@angular/material/tooltip";
import { ChatApiClient } from "@law/api-clients";
import {
  ChatMessageResponse,
  ChatSessionSummary,
  ChatStreamEvent,
  DocumentScript,
  DraftResultResponse,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { finalize } from "rxjs";
import { BottomReachedDirective } from "../../core/directives/bottom-reached.directive";
import { DraftReviewPanelComponent } from "./components/draft-review-panel/draft-review-panel";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { SpeechRecognitionService } from "../../core/speech/speech-recognition.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";

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
  imports: [
    BottomReachedDirective,
    DatePipe,
    MatIconModule,
    MatTooltipModule,
    ReactiveFormsModule,
    TranslatePipe,
    DraftReviewPanelComponent,
  ],
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantComponent implements OnInit, AfterViewInit {
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly speechRecognition = inject(SpeechRecognitionService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private source: EventSource | null = null;
  private speechBaseText = "";
  private lastSpeechDraft = "";
  private lastSpeechText = "";

  @ViewChild("messagesContainer")
  private messagesContainer?: ElementRef<HTMLDivElement>;
  @ViewChild("draftTextarea")
  private draftTextarea?: ElementRef<HTMLTextAreaElement>;

  protected readonly composerForm = new FormGroup({
    draft: new FormControl("", { nonNullable: true }),
  });
  protected readonly sessions = signal<ChatSessionSummary[]>([]);
  protected readonly messages = signal<ChatMessageResponse[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly pendingFiles = signal<File[]>([]);
  protected readonly sessionPage = signal(1);
  protected readonly sessionSearch = signal("");
  protected readonly sessionTotalPages = signal(0);
  protected readonly loadingSessions = signal(false);
  protected readonly sending = signal(false);
  protected readonly classifying = signal(false);
  protected readonly error = signal("");
  protected readonly draft = signal<DraftResultResponse | null>(null);
  protected readonly draftText = signal("");
  protected readonly draftScript = signal<DocumentScript>("latin");
  protected readonly draftReviewNote = signal("");

  constructor() {
    effect(() => {
      const speechError = this.speechRecognition.error();
      if (speechError) this.toast.error(speechError);
    });

    effect(() => {
      const speechText =
        `${this.speechRecognition.transcript()} ${this.speechRecognition.interimTranscript()}`.trim();
      if (!speechText || speechText === this.lastSpeechText) return;
      this.applySpeechText(speechText);
    });
  }

  ngOnInit(): void {
    this.destroyRef.onDestroy(() => {
      this.source?.close();
      this.speechRecognition.reset();
    });
    this.loadSessions();
  }

  ngAfterViewInit(): void {
    this.focusDraftTextarea();
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

  protected resizeTextarea(event: Event): void {
    this.resizeTextareaElement(event.target as HTMLTextAreaElement);
  }

  protected toggleSpeechRecognition(): void {
    if (!this.speechRecognition.isListening()) {
      const currentDraft = this.composerForm.controls.draft.value;
      this.speechBaseText = currentDraft.trimEnd();
      this.lastSpeechDraft = currentDraft;
      this.lastSpeechText = "";
    }

    this.speechRecognition.toggle();
  }

  private resizeTextareaElement(textarea: HTMLTextAreaElement): void {
    const maxHeight = 300;

    textarea.style.height = "auto";
    textarea.style.overflowY = "hidden";
    const height = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = `${height}px`;
    textarea.style.overflowY =
      textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }

  protected loadSessions(append = false): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.loadingSessions()) return;

    const page = append ? this.sessionPage() + 1 : this.sessionPage();
    if (append && page > this.sessionTotalPages()) return;

    this.loadingSessions.set(true);

    this.chat
      .listSessions(workspaceId, {
        page,
        search: this.sessionSearch(),
      })
      .pipe(finalize(() => this.loadingSessions.set(false)))
      .subscribe({
        next: (response) => {
          this.sessions.update((sessions) =>
            append ? [...sessions, ...response.items] : response.items,
          );
          this.sessionPage.set(page);
          this.sessionTotalPages.set(response.meta.totalPages);
          if (!append) {
            const selectedSessionId = this.selectedSessionId();
            if (selectedSessionId) {
              const exists = response.items.some(
                (session) => session.id === selectedSessionId,
              );
              if (exists) return;
            }
            const firstSession = response.items[0];
            if (firstSession) this.selectSession(firstSession.id);
          }
        },
        error: () => this.error.set("Unable to load chats."),
      });
  }

  protected loadNextSessionPage(): void {
    this.loadSessions(true);
  }

  protected onSessionSearch(event: Event): void {
    this.sessionSearch.set((event.target as HTMLInputElement).value);
    this.sessionPage.set(1);
    this.sessions.set([]);
    this.loadSessions();
  }

  protected createSession(): void {
    if (this.selectedSessionId() && !this.messages().length) return;

    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.chat.createSession({ workspaceId }).subscribe({
      next: (session) => {
        this.sessionPage.set(1);
        this.sessions.set([]);
        this.loadSessions();
        this.selectSession(session.id);
        this.focusDraftTextarea();
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
        this.scheduleMessagesScroll();
        const lastMessage = detail.messages[detail.messages.length - 1];
        this.listen(sessionId, lastMessage?.createdAt);
        this.loadDrafts(workspaceId, sessionId);
      },
      error: () => this.error.set("Unable to load this conversation."),
    });
  }

  protected loadDrafts(workspaceId: string, sessionId: string): void {
    this.chat.listDrafts(workspaceId, sessionId).subscribe({
      next: (drafts) => {
        const draft = drafts[0] ?? null;
        this.draft.set(draft);
        this.draftText.set(
          draft?.finalDocumentText ?? draft?.documentText ?? "",
        );
        this.draftScript.set("latin");
        this.draftReviewNote.set("");
      },
      error: () => this.draft.set(null),
    });
  }

  protected onDraftScriptChange(script: DocumentScript): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat.getDraft(workspaceId, activeDraft.jobId, script).subscribe({
      next: (draft) => {
        this.draft.set(draft);
        this.draftText.set(draft.documentText);
        this.draftScript.set(script);
      },
      error: () => this.error.set("Unable to change document script."),
    });
  }

  protected updateDraft(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .updateDraft(workspaceId, activeDraft.id, this.draftText())
      .subscribe({
        next: (draft) => {
          this.draft.set(draft);
          this.draftText.set(draft.finalDocumentText ?? draft.documentText);
        },
        error: () => this.error.set("Unable to update this draft."),
      });
  }

  protected approveDraft(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .approveDraft(workspaceId, activeDraft.id, this.draftReviewNote())
      .subscribe({
        next: (draft) => this.draft.set(draft),
        error: () => this.error.set("Unable to approve this draft."),
      });
  }

  protected rejectDraft(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .rejectDraft(workspaceId, activeDraft.id, this.draftReviewNote())
      .subscribe({
        next: (draft) => this.draft.set(draft),
        error: () => this.error.set("Unable to reject this draft."),
      });
  }

  protected requestChangesDraft(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .requestChangesDraft(workspaceId, activeDraft.id, this.draftReviewNote())
      .subscribe({
        next: (draft) => this.draft.set(draft),
        error: () => this.error.set("Unable to request changes."),
      });
  }

  protected deleteSession(sessionId: string): void {
    this.confirmDialog
      .confirm({
        title: this.localization.translate("assistant.deleteConversation"),
        message: this.localization.translate(
          "assistant.deleteConversationConfirm",
        ),
        confirmText: this.localization.translate(
          "assistant.deleteConversationAction",
        ),
        cancelText: this.localization.translate("settings.cancel"),
        variant: "danger",
      })
      .subscribe((confirmed) => {
        if (!confirmed) return;

        const workspaceId = this.workspaceId();
        if (!workspaceId) return;

        this.chat.deleteSession(workspaceId, sessionId).subscribe({
          next: () => {
            this.sessions.update((items) =>
              items.filter((item) => item.id !== sessionId),
            );
            this.toast.success(
              this.localization.translate("assistant.conversationDeleted"),
            );
            if (this.selectedSessionId() === sessionId) {
              this.selectedSessionId.set(null);
              this.messages.set([]);
              this.classifying.set(false);
              this.source?.close();
              this.source = null;
              this.focusDraftTextarea();
            }
          },
          error: () => {
            this.toast.error(
              this.localization.translate("assistant.conversationDeleteError"),
            );
          },
        });
      });
  }

  protected onFiles(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.addFiles(Array.from(input.files ?? []));
    input.value = "";
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    this.addFiles(Array.from(event.dataTransfer?.files ?? []));
  }

  protected onPaste(event: ClipboardEvent, target: EventTarget | null): void {
    const clipboardData = event.clipboardData;
    if (!clipboardData) return;

    const files = Array.from(clipboardData.files);
    if (files.length) {
      event.preventDefault();
      this.addFiles(files);
    }

    const text = clipboardData.getData("text");
    if (text && !files.length) {
      event.preventDefault();
      const draft = this.composerForm.controls.draft.value;
      this.composerForm.controls.draft.setValue(`${draft}${text}`);
      requestAnimationFrame(() => {
        if (target instanceof HTMLTextAreaElement) {
          this.resizeTextareaElement(target);
        }
      });
    }
  }

  private addFiles(files: File[]): void {
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
      return;
    }

    this.pendingFiles.update((current) => [...current, ...accepted]);
    if (rejected.length) this.error.set(rejected[0]);
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
          this.speechRecognition.reset();
          this.resetTextarea();
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
    if (event.type === "session.title.updated") {
      this.upsertSessionTitle(event.sessionId, event.title ?? null);
    }
    if (event.type === "error") {
      this.classifying.set(false);
      this.error.set(
        event.error ?? "The assistant could not process this message.",
      );
    }
  }

  private upsertSessionTitle(sessionId: string, title: string | null): void {
    this.sessions.update((items) =>
      items.map((item) => (item.id === sessionId ? { ...item, title } : item)),
    );
  }

  private upsertMessage(message: ChatMessageResponse): void {
    this.messages.update((items) => {
      if (items.some((item) => item.id === message.id)) return items;
      return [...items, message];
    });
    this.scheduleMessagesScroll();
  }

  private scheduleMessagesScroll(): void {
    requestAnimationFrame(() => {
      const messagesContainer = this.messagesContainer?.nativeElement;
      if (!messagesContainer) return;
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    });
  }

  private resetTextarea(): void {
    const textarea = this.draftTextarea?.nativeElement;
    if (!textarea) return;
    textarea.style.height = "";
    textarea.style.overflowY = "hidden";
  }

  private applySpeechText(speechText: string): void {
    const draftControl = this.composerForm.controls.draft;
    const currentDraft = draftControl.value;
    let baseText = this.speechBaseText;

    if (currentDraft !== this.lastSpeechDraft) {
      baseText = currentDraft.trimEnd();
      if (this.lastSpeechText && baseText.endsWith(this.lastSpeechText)) {
        baseText = baseText.slice(0, -this.lastSpeechText.length).trimEnd();
      }
      this.speechBaseText = baseText;
    }

    const nextDraft = this.appendText(baseText, speechText);
    draftControl.setValue(nextDraft, { emitEvent: false });
    this.lastSpeechDraft = nextDraft;
    this.lastSpeechText = speechText;
    requestAnimationFrame(() => {
      const textarea = this.draftTextarea?.nativeElement;
      if (textarea) this.resizeTextareaElement(textarea);
    });
  }

  private appendText(baseText: string, addition: string): string {
    const base = baseText.trimEnd();
    const text = addition.trim();
    if (!base) return text;
    if (!text) return base;
    return `${base} ${text}`;
  }

  private focusDraftTextarea(): void {
    requestAnimationFrame(() => this.draftTextarea?.nativeElement.focus());
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
