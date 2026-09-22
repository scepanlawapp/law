import { DatePipe, NgTemplateOutlet } from "@angular/common";
import {
  Component,
  ChangeDetectionStrategy,
  computed,
  DestroyRef,
  ElementRef,
  AfterViewInit,
  OnInit,
  ViewChild,
  effect,
  inject,
  signal,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { FormControl, FormGroup, ReactiveFormsModule } from "@angular/forms";
import { ActivatedRoute, Router } from "@angular/router";
import { NgIcon, provideIcons } from "@ng-icons/core";
import {
  lucideArrowUp,
  lucideBot,
  lucideCheckCircle2,
  lucideChevronDown,
  lucideChevronUp,
  lucideCircleAlert,
  lucideCopy,
  lucideFileText,
  lucideLoaderCircle,
  lucideMenu,
  lucideMessageCircle,
  lucideMic,
  lucideMicOff,
  lucidePaperclip,
  lucidePlus,
  lucideRefreshCw,
  lucideSearch,
  lucideSparkles,
  lucideThumbsDown,
  lucideThumbsUp,
  lucideUser,
  lucideX,
} from "@ng-icons/lucide";
import { HlmTooltipImports } from "@spartan-ng/helm/tooltip";
import { HlmButton } from "@spartan-ng/helm/button";
import { HlmInputGroupImports } from "@spartan-ng/helm/input-group";
import { HlmTextarea } from "@spartan-ng/helm/textarea";
import {
  HlmSheet,
  HlmSheetClose,
  HlmSheetContent,
  HlmSheetDescription,
  HlmSheetPortal,
  HlmSheetTitle,
  HlmSheetTrigger,
} from "@spartan-ng/helm/sheet";
import { ChatApiClient } from "@law/api-clients";
import {
  ChatMessageResponse,
  ChatMessageFeedback,
  ChatSessionDetail,
  ChatSessionSummary,
  ChatStreamEvent,
  DocumentScript,
  DraftResultResponse,
  WorkflowJobResponse,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { finalize } from "rxjs";
import { BottomReachedDirective } from "../../core/directives/bottom-reached.directive";
import { AssistantMatterLinkComponent } from "./matter-link.component";
import { DraftReviewPanelComponent } from "./components/draft-review-panel/draft-review-panel";
import { CitationListComponent } from "./components/citation-list/citation-list";
import { LocalizationService } from "../../core/localization/localization.service";
import { TranslatePipe } from "../../core/localization/translate.pipe";
import { SpeechRecognitionService } from "../../core/speech/speech-recognition.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { AssistantMarkdownPipe } from "./assistant-markdown.pipe";
import {
  buildWorkflowActivityState,
  reduceWorkflowActivityEvent,
  selectWorkflowActivities,
  WorkflowActivityState,
} from "./assistant-workflow-state";
import { HlmSpinner } from "@spartan-ng/helm/spinner";

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

interface SessionGroup {
  key: string;
  date: Date;
  label: "assistant.today" | "assistant.yesterday" | null;
  sessions: ChatSessionSummary[];
}

@Component({
  selector: "law-assistant",
  standalone: true,
  imports: [
    BottomReachedDirective,
    DatePipe,
    NgTemplateOutlet,
    NgIcon,
    HlmTooltipImports,
    HlmButton,
    HlmInputGroupImports,
    HlmTextarea,
    HlmSheet,
    HlmSheetClose,
    HlmSheetContent,
    HlmSheetDescription,
    HlmSheetPortal,
    HlmSheetTitle,
    HlmSheetTrigger,
    ReactiveFormsModule,
    TranslatePipe,
    AssistantMarkdownPipe,
    AssistantMatterLinkComponent,
    DraftReviewPanelComponent,
    CitationListComponent,
    HlmSpinner,
  ],
  templateUrl: "./assistant.component.html",
  styleUrl: "./assistant.component.scss",
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    provideIcons({
      lucideArrowUp,
      lucideBot,
      lucideCheckCircle2,
      lucideChevronDown,
      lucideChevronUp,
      lucideCircleAlert,
      lucideCopy,
      lucideFileText,
      lucideLoaderCircle,
      lucideMenu,
      lucideMessageCircle,
      lucideMic,
      lucideMicOff,
      lucidePaperclip,
      lucidePlus,
      lucideRefreshCw,
      lucideSearch,
      lucideSparkles,
      lucideThumbsDown,
      lucideThumbsUp,
      lucideUser,
      lucideX,
    }),
  ],
})
export class AssistantComponent implements OnInit, AfterViewInit {
  private readonly authState = inject(AuthState);
  private readonly chat = inject(ChatApiClient);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly speechRecognition = inject(SpeechRecognitionService);
  private readonly confirmDialog = inject(ConfirmDialogService);
  private readonly localization = inject(LocalizationService);
  private readonly toast = inject(ToastService);
  private source: EventSource | null = null;
  private sessionRefreshTimer: ReturnType<typeof setTimeout> | null = null;
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
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
  protected readonly sessionGroups = computed<SessionGroup[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const groups = new Map<string, SessionGroup>();

    for (const session of this.sessions()) {
      const date = new Date(session.updatedAt);
      const day = new Date(date);
      day.setHours(0, 0, 0, 0);
      const key = day.toISOString();
      const differenceInDays = Math.round(
        (today.getTime() - day.getTime()) / 86_400_000,
      );

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          date: day,
          label:
            differenceInDays === 0
              ? "assistant.today"
              : differenceInDays === 1
                ? "assistant.yesterday"
                : null,
          sessions: [],
        });
      }
      groups.get(key)?.sessions.push(session);
    }

    return [...groups.values()].sort(
      (first, second) => second.date.getTime() - first.date.getTime(),
    );
  });
  protected readonly messages = signal<ChatMessageResponse[]>([]);
  protected readonly selectedSessionId = signal<string | null>(null);
  protected readonly pendingCaseId = signal<string | null>(null);
  protected readonly latestBriefId = signal<string | null>(null);
  protected readonly selectedSessionTitle = computed(
    () =>
      this.sessions().find((session) => session.id === this.selectedSessionId())
        ?.title ?? null,
  );
  protected readonly pendingFiles = signal<File[]>([]);
  protected readonly sessionPage = signal(1);
  protected readonly sessionSearch = signal("");
  protected readonly sessionTotalPages = signal(0);
  protected readonly loadingSessions = signal(false);
  protected readonly sending = signal(false);
  protected readonly retryingJobId = signal<string | null>(null);
  protected readonly resyncing = signal(false);
  protected readonly feedbackMessageId = signal<string | null>(null);
  protected readonly regeneratingMessageId = signal<string | null>(null);
  private readonly clock = signal(Date.now());
  protected readonly expandedActivities = signal<ReadonlySet<string>>(
    new Set(),
  );
  protected readonly workflowState = signal<WorkflowActivityState>({});
  protected readonly workflowActivities = computed(() =>
    selectWorkflowActivities(this.workflowState()),
  );
  protected readonly error = signal("");
  protected readonly draft = signal<DraftResultResponse | null>(null);
  protected readonly draftText = signal("");
  protected readonly draftScript = signal<DocumentScript>("latin");
  protected readonly draftReviewNote = signal("");
  protected readonly draftReviewExpanded = signal(false);
  protected readonly conversationSheetOpen = signal(false);
  private loadedDraftId: string | null = null;

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
      if (this.sessionRefreshTimer) clearTimeout(this.sessionRefreshTimer);
      if (this.elapsedTimer) clearInterval(this.elapsedTimer);
      this.speechRecognition.reset();
    });
    this.elapsedTimer = setInterval(() => this.clock.set(Date.now()), 1000);
    this.pendingCaseId.set(this.route.snapshot.queryParamMap.get("caseId"));
    this.loadSessions();
    this.listenWorkspace();
    this.consumeHandoffPrompt();
  }

  /** One-time handoff from the dashboard's prompt box; never resent on reload/back-nav. */
  private consumeHandoffPrompt(): void {
    const prompt = this.route.snapshot.queryParamMap.get("prompt");
    if (!prompt) return;
    this.composerForm.controls.draft.setValue(prompt);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { prompt: null },
      queryParamsHandling: "merge",
      replaceUrl: true,
    });
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

  protected elapsedSeconds(startedAt: string): number {
    return Math.max(
      0,
      Math.floor((this.clock() - new Date(startedAt).getTime()) / 1000),
    );
  }

  protected openDraftReview(): void {
    if (this.draft()) this.draftReviewExpanded.set(true);
  }

  protected toggleActivity(correlationId: string): void {
    this.expandedActivities.update((current) => {
      const next = new Set(current);
      if (next.has(correlationId)) next.delete(correlationId);
      else next.add(correlationId);
      return next;
    });
  }

  protected activityFor(correlationId?: string | null) {
    if (!correlationId) return null;
    return (
      this.workflowActivities().find(
        (activity) => activity.correlationId === correlationId,
      ) ?? null
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
      .pipe(
        finalize(() => this.loadingSessions.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
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

    this.chat
      .createSession({ workspaceId, caseId: this.pendingCaseId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
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

  protected selectedSession(): ChatSessionSummary | null {
    return (
      this.sessions().find(
        (session) => session.id === this.selectedSessionId(),
      ) ?? null
    );
  }

  protected onSessionLinked(session: ChatSessionSummary): void {
    this.sessions.update((items) =>
      items.map((item) =>
        item.id === session.id ? { ...item, ...session } : item,
      ),
    );
  }

  protected selectSession(sessionId: string): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;

    this.selectedSessionId.set(sessionId);
    this.conversationSheetOpen.set(false);
    this.error.set("");
    this.workflowState.set({});
    this.chat
      .getSession(workspaceId, sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (detail) => {
          if (this.selectedSessionId() !== sessionId) return;
          this.messages.set(detail.messages);
          this.workflowState.set(buildWorkflowActivityState(detail));
          this.scheduleMessagesScroll();
          const latestDraft = detail.drafts[detail.drafts.length - 1] ?? null;
          this.applyDraft(latestDraft);
          this.latestBriefId.set(this.briefIdFromDetail(detail));
        },
        error: () => this.error.set("Unable to load this conversation."),
      });
  }

  protected loadDrafts(workspaceId: string, sessionId: string): void {
    this.chat
      .listDrafts(workspaceId, sessionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (drafts) => this.applyDraft(drafts[0] ?? null),
        error: () => this.draft.set(null),
      });
  }

  private applyDraft(draft: DraftResultResponse | null): void {
    if (draft && draft.id !== this.loadedDraftId) {
      this.draftReviewExpanded.set(true);
    }
    if (!draft) this.draftReviewExpanded.set(false);
    this.loadedDraftId = draft?.id ?? null;
    this.draft.set(draft);
    this.draftText.set(draft?.finalDocumentText ?? draft?.documentText ?? "");
    this.draftScript.set("latin");
    this.draftReviewNote.set("");
  }

  protected onDraftScriptChange(script: DocumentScript): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .getDraft(workspaceId, activeDraft.jobId, script)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draft) => {
          this.draft.set(draft);
          this.draftText.set(draft.documentText);
          this.draftScript.set(script);
        },
        error: () => this.error.set("Unable to change document script."),
      });
  }

  protected exportDraftDocx(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    const exportUrl = this.chat.exportUrl(
      workspaceId,
      activeDraft.id,
      this.draftScript(),
    );
    window.open(exportUrl, "_blank", "noopener,noreferrer");
  }

  protected updateDraft(): void {
    const workspaceId = this.workspaceId();
    const activeDraft = this.draft();
    if (!workspaceId || !activeDraft) return;

    this.chat
      .updateDraft(workspaceId, activeDraft.id, this.draftText())
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (draft) => this.draft.set(draft),
        error: () => this.error.set("Unable to request changes."),
      });
  }

  protected retryWorkflow(jobId: string): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.retryingJobId()) return;
    this.retryingJobId.set(jobId);
    this.chat
      .retryJob(workspaceId, jobId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.retryingJobId.set(null);
          this.handleEvent({
            type: "job.queued",
            workspaceId,
            sessionId: job.sessionId,
            correlationId: job.correlationId,
            createdAt: job.createdAt,
            job,
          });
        },
        error: () => {
          this.retryingJobId.set(null);
          this.toast.error(
            this.localization.translate("assistant.workflow.retryError"),
          );
        },
      });
  }

  protected updateMessageFeedback(
    message: ChatMessageResponse,
    feedback: ChatMessageFeedback,
  ): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.feedbackMessageId()) return;
    this.feedbackMessageId.set(message.id);
    this.chat
      .updateMessageFeedback(
        workspaceId,
        message.id,
        message.feedback === feedback ? null : feedback,
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.feedbackMessageId.set(null);
          this.upsertMessage(updated);
        },
        error: () => {
          this.feedbackMessageId.set(null);
          this.toast.error(
            this.localization.translate("assistant.feedbackError"),
          );
        },
      });
  }

  protected copyMessage(message: ChatMessageResponse): void {
    void navigator.clipboard.writeText(message.content).then(
      () =>
        this.toast.success(
          this.localization.translate("assistant.responseCopied"),
        ),
      () =>
        this.toast.error(this.localization.translate("assistant.copyError")),
    );
  }

  protected regenerateAnswer(message: ChatMessageResponse): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.regeneratingMessageId()) return;
    this.regeneratingMessageId.set(message.id);
    this.chat
      .regenerateAnswer(workspaceId, message.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (job) => {
          this.regeneratingMessageId.set(null);
          this.handleEvent({
            type: "job.queued",
            workspaceId,
            sessionId: job.sessionId,
            correlationId: job.correlationId,
            createdAt: job.createdAt,
            job,
          });
        },
        error: () => {
          this.regeneratingMessageId.set(null);
          this.toast.error(
            this.localization.translate("assistant.regenerateError"),
          );
        },
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((confirmed) => {
        if (!confirmed) return;

        const workspaceId = this.workspaceId();
        if (!workspaceId) return;

        this.chat
          .deleteSession(workspaceId, sessionId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({
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
                this.draft.set(null);
                this.loadedDraftId = null;
                this.draftReviewExpanded.set(false);
                this.workflowState.set({});
                this.source?.close();
                this.source = null;
                this.focusDraftTextarea();
              }
            },
            error: () => {
              this.toast.error(
                this.localization.translate(
                  "assistant.conversationDeleteError",
                ),
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
      this.chat
        .createSession({ workspaceId, caseId: this.pendingCaseId() })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
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

  protected citationMarkers(message: ChatMessageResponse): number[] {
    return message.citations?.map((citation) => citation.marker) ?? [];
  }

  protected send(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || !this.canSend()) return;

    const sessionId = this.selectedSessionId();
    if (sessionId) {
      this.sendMessage(sessionId);
      return;
    }

    this.chat
      .createSession({ workspaceId, caseId: this.pendingCaseId() })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (session) => {
          this.sessions.update((items) => [session, ...items]);
          this.selectedSessionId.set(session.id);
          this.workflowState.set({});
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
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.upsertMessage(response.userMessage);
          this.composerForm.reset();
          this.speechRecognition.reset();
          this.resetTextarea();
          this.pendingFiles.set([]);
          this.sending.set(false);
          this.loadSessions();
        },
        error: () => {
          this.sending.set(false);
          this.error.set("Unable to send that message.");
        },
      });
  }

  private listenWorkspace(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId || this.source || typeof EventSource === "undefined") {
      return;
    }

    this.source = new EventSource(this.chat.workspaceEventsUrl(workspaceId), {
      withCredentials: true,
    });
    this.source.onmessage = (event) => {
      try {
        this.handleWorkspaceEvent(JSON.parse(event.data) as ChatStreamEvent);
      } catch {
        this.error.set("Received an unreadable chat event.");
      }
    };
    this.source.onerror = () => {
      this.resyncSelectedSession();
      this.scheduleSessionRefresh();
    };
  }

  private handleWorkspaceEvent(event: ChatStreamEvent): void {
    if (event.type === "session.deleted") {
      this.sessions.update((items) =>
        items.filter((session) => session.id !== event.sessionId),
      );
    }
    if (event.sessionId === this.selectedSessionId()) {
      this.handleEvent(event);
    } else {
      this.handleBackgroundEvent(event);
    }
    if (
      event.type === "job.queued" ||
      event.type === "job.updated" ||
      event.type === "draft.updated" ||
      event.type === "session.title.updated" ||
      event.type === "session.deleted"
    ) {
      this.scheduleSessionRefresh();
    }
  }

  private handleBackgroundEvent(event: ChatStreamEvent): void {
    if (event.type === "session.title.updated") {
      this.upsertSessionTitle(event.sessionId, event.title ?? null);
    }
    if (event.type === "draft.updated") {
      this.toast.success(
        this.localization.translate("assistant.backgroundDraftReady"),
      );
    } else if (
      event.type === "message.updated" &&
      event.message?.role === "ASSISTANT" &&
      event.message.status === "COMPLETED"
    ) {
      this.toast.success(
        this.localization.translate("assistant.backgroundAnswerReady"),
      );
    } else if (event.type === "error") {
      this.toast.error(
        event.error ??
          this.localization.translate("assistant.backgroundProcessingError"),
      );
    }
  }

  private scheduleSessionRefresh(): void {
    if (this.sessionRefreshTimer) clearTimeout(this.sessionRefreshTimer);
    this.sessionRefreshTimer = setTimeout(() => {
      this.sessionRefreshTimer = null;
      this.refreshSessionSummaries();
    }, 100);
  }

  private refreshSessionSummaries(): void {
    const workspaceId = this.workspaceId();
    if (!workspaceId) return;
    this.chat
      .listSessions(workspaceId, {
        page: 1,
        search: this.sessionSearch(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          const remaining = this.sessions().filter(
            (session) =>
              !response.items.some((updated) => updated.id === session.id),
          );
          this.sessions.set([...response.items, ...remaining]);
          this.sessionTotalPages.set(response.meta.totalPages);
        },
        error: () => undefined,
      });
  }

  private resyncSelectedSession(): void {
    const workspaceId = this.workspaceId();
    const sessionId = this.selectedSessionId();
    if (!workspaceId || !sessionId || this.resyncing()) return;
    this.resyncing.set(true);
    this.chat
      .getSession(workspaceId, sessionId)
      .pipe(
        finalize(() => this.resyncing.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (detail) => {
          if (this.selectedSessionId() !== sessionId) return;
          this.messages.set(detail.messages);
          this.workflowState.set(buildWorkflowActivityState(detail));
          this.applyDraft(detail.drafts[detail.drafts.length - 1] ?? null);
          this.latestBriefId.set(this.briefIdFromDetail(detail));
          this.scheduleMessagesScroll();
        },
        error: () => undefined,
      });
  }

  private handleEvent(event: ChatStreamEvent): void {
    this.workflowState.update((state) =>
      reduceWorkflowActivityEvent(state, event),
    );
    if (
      (event.type === "message.created" ||
        event.type === "message.started" ||
        event.type === "message.updated") &&
      event.message
    ) {
      this.upsertMessage(event.message);
    }
    if (event.type === "message.delta" && event.messageId && event.delta) {
      this.appendMessageDelta(event.messageId, event.delta);
    }
    if (event.type === "attachment.updated" && event.attachment) {
      this.updateAttachment(event.attachment);
    }
    if (event.type === "draft.updated" && event.draft) {
      this.applyDraft(event.draft);
    }
    if (
      event.type === "job.updated" &&
      event.job?.workflowName === "brief-extraction" &&
      event.job.status === "COMPLETED" &&
      event.job.briefResultId
    ) {
      this.latestBriefId.set(event.job.briefResultId);
    }
    if (event.type === "session.title.updated") {
      this.upsertSessionTitle(event.sessionId, event.title ?? null);
    }
    if (event.type === "error") {
      this.error.set(
        event.error ?? "The assistant could not process this message.",
      );
    }
  }

  private briefIdFromDetail(detail: ChatSessionDetail): string | null {
    const fromJob = [...detail.jobs]
      .reverse()
      .find(
        (job): job is WorkflowJobResponse & { briefResultId: string } =>
          job.workflowName === "brief-extraction" &&
          job.status === "COMPLETED" &&
          Boolean(job.briefResultId),
      );
    return fromJob?.briefResultId ?? detail.latestBriefId;
  }

  private upsertSessionTitle(sessionId: string, title: string | null): void {
    this.sessions.update((items) =>
      items.map((item) => (item.id === sessionId ? { ...item, title } : item)),
    );
  }

  private upsertMessage(message: ChatMessageResponse): void {
    this.messages.update((items) => {
      const index = items.findIndex((item) => item.id === message.id);
      if (index === -1) return [...items, message];
      return items.map((item) => (item.id === message.id ? message : item));
    });
    this.scheduleMessagesScroll();
  }

  private appendMessageDelta(messageId: string, delta: string): void {
    this.messages.update((items) =>
      items.map((message) =>
        message.id === messageId
          ? { ...message, content: `${message.content}${delta}` }
          : message,
      ),
    );
    this.scheduleMessagesScroll();
  }

  private updateAttachment(
    attachment: ChatMessageResponse["attachments"][number],
  ): void {
    this.messages.update((items) =>
      items.map((message) => ({
        ...message,
        attachments: message.attachments.map((item) =>
          item.id === attachment.id ? attachment : item,
        ),
      })),
    );
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
    requestAnimationFrame(() => {
      const textarea = this.draftTextarea?.nativeElement;
      if (!textarea) return;
      textarea.focus();
      if (textarea.value) this.resizeTextareaElement(textarea);
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
