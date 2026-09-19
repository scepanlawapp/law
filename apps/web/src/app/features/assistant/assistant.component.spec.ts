import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { NEVER, of } from "rxjs";
import { ChatApiClient } from "@law/api-clients";
import { ChatMessageResponse, DraftResultResponse } from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { SpeechRecognitionService } from "../../core/speech/speech-recognition.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { AssistantComponent } from "./assistant.component";

const createDraft = (id: string): DraftResultResponse => ({
  id,
  jobId: `job-${id}`,
  workspaceId: "workspace-1",
  sessionId: "session-1",
  messageId: null,
  briefResultId: null,
  documentText: `Document ${id}`,
  warnings: [],
  missingFields: [],
  citations: [],
  promptChars: 100,
  truncated: false,
  model: "test-model",
  approvalStatus: "READY_FOR_SIGNOFF",
  createdAt: "2026-09-15T12:00:00.000Z",
});

describe("AssistantComponent review state", () => {
  const session = {
    id: "session-1",
    workspaceId: "workspace-1",
    createdByUserId: "user-1",
    title: "Selected conversation",
    status: "ACTIVE" as const,
    isDeleted: false,
    createdAt: "2026-09-15T10:00:00.000Z",
    updatedAt: "2026-09-15T12:00:00.000Z",
  };
  const chat = {
    listSessions: jest.fn(),
    getSession: jest.fn(),
    listDrafts: jest.fn(),
    retryJob: jest.fn(),
    workspaceEventsUrl: jest.fn(() => "http://localhost/api/chat/events"),
    updateMessageFeedback: jest.fn(),
  };
  const toast = {
    error: jest.fn(),
    success: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    chat.listSessions.mockReturnValue(NEVER);
    chat.getSession.mockReturnValue(NEVER);
    chat.listDrafts.mockReturnValue(of([]));

    await TestBed.configureTestingModule({
      imports: [AssistantComponent],
      providers: [
        {
          provide: AuthState,
          useValue: {
            session: signal({
              memberships: [{ workspaceId: "workspace-1" }],
            }),
          },
        },
        { provide: ChatApiClient, useValue: chat },
        {
          provide: SpeechRecognitionService,
          useValue: {
            error: signal(""),
            transcript: signal(""),
            interimTranscript: signal(""),
            isSupported: signal(false),
            isListening: signal(false),
            toggle: jest.fn(),
            reset: jest.fn(),
          },
        },
        {
          provide: ConfirmDialogService,
          useValue: { confirm: jest.fn(() => of(false)) },
        },
        {
          provide: ToastService,
          useValue: toast,
        },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { queryParamMap: convertToParamMap({}) },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
      ],
    }).compileComponents();
  });

  it("opens a new draft and preserves collapse state for the same draft", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const firstDraft = createDraft("draft-1");

    chat.listDrafts.mockReturnValue(of([firstDraft]));
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["draftReviewExpanded"]()).toBe(true);

    component["draftReviewExpanded"].set(false);
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["draftReviewExpanded"]()).toBe(false);

    chat.listDrafts.mockReturnValue(of([createDraft("draft-2")]));
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["draftReviewExpanded"]()).toBe(true);
  });

  it("clears review state when a conversation has no draft", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;

    chat.listDrafts.mockReturnValue(of([createDraft("draft-1")]));
    component["loadDrafts"]("workspace-1", "session-1");
    chat.listDrafts.mockReturnValue(of([]));
    component["loadDrafts"]("workspace-1", "session-2");

    expect(component["draft"]()).toBeNull();
    expect(component["draftReviewExpanded"]()).toBe(false);
  });

  it("closes mobile conversation navigation when selecting a session", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["conversationSheetOpen"].set(true);

    component["selectSession"]("session-2");

    expect(component["selectedSessionId"]()).toBe("session-2");
    expect(component["conversationSheetOpen"]()).toBe(false);
  });

  it("renders selected conversation and accessible sheet controls", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);
    component["conversationSheetOpen"].set(true);
    fixture.detectChanges();

    const selected = fixture.nativeElement.querySelector(
      ".conversation-item.is-selected",
    ) as HTMLButtonElement;
    expect(selected.getAttribute("aria-current")).toBe("true");
    expect(selected.textContent).toContain(session.title);

    const trigger = fixture.nativeElement.querySelector(
      ".mobile-conversation-trigger",
    ) as HTMLButtonElement;
    expect(trigger.hasAttribute("hlmSheetTrigger")).toBe(true);
    expect(trigger.getAttribute("aria-label")).toBe("assistant.conversations");
    expect(
      document.querySelector(".sheet-accessible-header h2")?.textContent,
    ).toContain("assistant.conversations");
    expect(
      document.querySelector(".sheet-accessible-header p")?.textContent,
    ).toContain("assistant.sidebarDescription");
    expect(
      document
        .querySelector(".conversation-sheet-close")
        ?.getAttribute("aria-label"),
    ).toBe("assistant.closeConversations");
  });

  it("connects the mobile draft toggle to the review content", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["draft"].set(createDraft("draft-1"));
    component["draftReviewExpanded"].set(true);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      ".draft-mobile-toggle",
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("draft-review-content");
  });

  it("renders live workflow state without locking the composer", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["composerForm"].controls.draft.setValue("Next question");
    component["messages"].set([
      {
        id: "message-user",
        sessionId: "session-1",
        role: "USER",
        content: "Prepare a draft",
        status: "COMPLETED",
        correlationId: "corr-1",
        createdAt: "2026-09-15T11:59:00.000Z",
        attachments: [],
      },
    ]);
    component["handleEvent"]({
      type: "job.updated",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      correlationId: "corr-1",
      createdAt: "2026-09-15T12:00:00.000Z",
      job: {
        id: "job-1",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        workflowName: "brief-extraction",
        status: "RUNNING",
        correlationId: "corr-1",
        progressStage: "EXTRACTING_FACTS",
        createdAt: "2026-09-15T11:59:00.000Z",
        updatedAt: "2026-09-15T12:00:00.000Z",
      },
    });
    fixture.detectChanges();

    const activity = fixture.nativeElement.querySelector(
      '.workflow-activity[data-state="active"]',
    ) as HTMLElement;
    const submit = fixture.nativeElement.querySelector(
      '.composer button[type="submit"]',
    ) as HTMLButtonElement;
    expect(activity.textContent).toContain(
      "assistant.workflow.stage.EXTRACTING_FACTS",
    );
    expect(submit.disabled).toBe(false);
  });

  it("assembles message deltas and applies a live draft immediately", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const pending: ChatMessageResponse = {
      id: "message-answer",
      sessionId: "session-1",
      role: "ASSISTANT",
      content: "Opšti ",
      status: "PENDING",
      correlationId: "corr-1",
      createdAt: "2026-09-15T12:00:00.000Z",
      attachments: [],
    };
    component["messages"].set([pending]);

    component["handleEvent"]({
      type: "message.delta",
      sessionId: "session-1",
      correlationId: "corr-1",
      messageId: pending.id,
      delta: "odgovor.",
      createdAt: "2026-09-15T12:00:01.000Z",
    });
    component["handleEvent"]({
      type: "draft.updated",
      sessionId: "session-1",
      correlationId: "corr-1",
      draft: createDraft("draft-live"),
      createdAt: "2026-09-15T12:00:02.000Z",
    });

    expect(component["messages"]()[0].content).toBe("Opšti odgovor.");
    expect(component["draft"]()?.id).toBe("draft-live");
    expect(component["draftReviewExpanded"]()).toBe(true);
  });

  it("restores authoritative activity and drafts during reconnect", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["selectedSessionId"].set("session-1");
    chat.getSession.mockReturnValue(
      of({
        ...session,
        messages: [],
        jobs: [
          {
            id: "job-running",
            workspaceId: "workspace-1",
            sessionId: "session-1",
            workflowName: "drafting",
            status: "RUNNING",
            correlationId: "corr-1",
            progressStage: "PREPARING_DRAFT",
            createdAt: "2026-09-15T12:00:00.000Z",
            updatedAt: "2026-09-15T12:00:01.000Z",
          },
        ],
        drafts: [createDraft("draft-resynced")],
      }),
    );

    component["resyncSelectedSession"]();

    expect(component["workflowActivities"]()).toEqual([
      expect.objectContaining({ status: "active", kind: "draft" }),
    ]);
    expect(component["draft"]()?.id).toBe("draft-resynced");
  });

  it("retries a failed workflow and immediately marks it active", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const failedJob = {
      id: "job-failed",
      workspaceId: "workspace-1",
      sessionId: "session-1",
      workflowName: "answering" as const,
      status: "FAILED" as const,
      correlationId: "corr-retry",
      progressStage: "PREPARING_ANSWER" as const,
      createdAt: "2026-09-15T12:00:00.000Z",
      updatedAt: "2026-09-15T12:00:01.000Z",
    };
    component["handleEvent"]({
      type: "job.updated",
      sessionId: "session-1",
      createdAt: failedJob.updatedAt,
      job: failedJob,
    });
    chat.retryJob.mockReturnValue(
      of({
        ...failedJob,
        id: "job-retry",
        status: "QUEUED",
        updatedAt: "2026-09-15T12:00:02.000Z",
      }),
    );

    component["retryWorkflow"](failedJob.id);

    expect(chat.retryJob).toHaveBeenCalledWith("workspace-1", failedJob.id);
    expect(component["workflowActivities"]()[0].status).toBe("active");
  });

  it("keeps background answers out of the selected transcript and toasts", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["selectedSessionId"].set("session-1");

    component["handleWorkspaceEvent"]({
      type: "message.updated",
      workspaceId: "workspace-1",
      sessionId: "session-2",
      correlationId: "corr-background",
      createdAt: "2026-09-15T12:00:00.000Z",
      message: {
        id: "message-background",
        sessionId: "session-2",
        role: "ASSISTANT",
        content: "Completed answer",
        status: "COMPLETED",
        correlationId: "corr-background",
        createdAt: "2026-09-15T12:00:00.000Z",
        attachments: [],
      },
    });

    expect(component["messages"]()).toEqual([]);
    expect(toast.success).toHaveBeenCalledWith(
      "assistant.backgroundAnswerReady",
    );
  });

  it("renders persisted conversation activity in navigation", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([
      {
        ...session,
        activity: {
          activeJobCount: 1,
          latestJob: null,
          hasDraft: false,
        },
      },
    ]);
    fixture.detectChanges();

    const activity = fixture.nativeElement.querySelector(
      ".conversation-item-copy small",
    ) as HTMLElement;
    expect(activity.textContent).toContain("assistant.conversationWorking");
  });
});
