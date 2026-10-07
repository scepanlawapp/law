import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { ActivatedRoute, Router, convertToParamMap } from "@angular/router";
import { NEVER, of } from "rxjs";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import {
  BriefApplyPreview,
  ChatMessageResponse,
  DocumentAnalysisResponse,
  DraftResultResponse,
} from "@law/api-interfaces";
import { AuthState } from "@law/security";
import { SpeechRecognitionService } from "../../core/speech/speech-recognition.service";
import { ConfirmDialogService } from "../../shared/ui/confirm-dialog/confirm-dialog.service";
import { ToastService } from "../../shared/ui/toast/toast.service";
import { AssistantComponent } from "./assistant.component";
import { StarterPickerService } from "./components/starter-picker/starter-picker.service";
import { StarterPickerResult } from "./assistant-starter-prompts";

const createDraft = (id: string): DraftResultResponse => ({
  id,
  documentType: "LAWSUIT",
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

const createAnalysis = (id: string): DocumentAnalysisResponse => ({
  id,
  sessionId: "session-1",
  caseId: null,
  kind: "CONTRACT_REVIEW",
  documentRef: "att:nda",
  documentTitle: "NDA Alfa",
  contractType: "NDA",
  clientSide: null,
  result: {
    summary: "Kratko.",
    keyTerms: [],
    issues: [],
    missingClauses: [],
    warnings: [],
  },
  citations: [],
  truncated: false,
  model: "test-model",
  createdAt: "2026-10-07T09:00:00.000Z",
});

const createBriefPreview = (briefId = "brief-1"): BriefApplyPreview => ({
  briefId,
  alreadyApplied: false,
  appliedCaseId: null,
  documentType: "LAWSUIT",
  parties: [
    { role: "plaintiff", label: "Tužilac", name: "Petar Petrović", address: null },
    { role: "defendant", label: "Tuženi", name: "ACME doo", address: null },
  ],
  clientRole: "plaintiff",
  clientPartyName: "Petar Petrović",
  clientPartyAddress: null,
  nameNeedsSplit: true,
  suggestedFirstName: "Petar",
  suggestedLastName: "Petrović",
  clientMatches: [],
  opposingPartyName: "ACME doo",
  opposingPartyAddress: null,
  suggestedCaseName: "Petar Petrović vs. ACME",
  suggestedDescription: "Opis",
  suggestedCaseNumber: "P-1/2026",
  responsibleUserId: "user-1",
  missingFields: [],
  warnings: [],
  confidence: null,
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
    previewBrief: jest.fn(() => NEVER),
    linkSessionCase: jest.fn(() => NEVER),
    applyBrief: jest.fn(() => NEVER),
    previewBriefTasks: jest.fn(() => NEVER),
    applyBriefTasks: jest.fn(() => NEVER),
    downloadUrl: jest.fn(() => "http://localhost/api/chat/attachments"),
    analysisExportUrl: jest.fn(),
    createSession: jest.fn(),
    sendMessage: jest.fn(),
  };
  const toast = {
    error: jest.fn(),
    success: jest.fn(),
  };
  const starterPicker = {
    open: jest.fn((): unknown => of(undefined as StarterPickerResult)),
  };

  const routeParams: Record<string, string> = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    for (const key of Object.keys(routeParams)) delete routeParams[key];
    chat.createSession.mockReturnValue(NEVER);
    chat.sendMessage.mockReturnValue(NEVER);
    starterPicker.open.mockReturnValue(of(undefined));
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
          provide: CasesApiClient,
          useValue: { list: jest.fn(() => NEVER) },
        },
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
            snapshot: {
              get queryParamMap() {
                return convertToParamMap(routeParams);
              },
            },
          },
        },
        { provide: Router, useValue: { navigate: jest.fn() } },
        { provide: StarterPickerService, useValue: starterPicker },
      ],
    }).compileComponents();
  });

  it("opens a new draft and preserves collapse state for the same draft", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const firstDraft = createDraft("draft-1");

    chat.listDrafts.mockReturnValue(of([firstDraft]));
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["rightRailExpanded"]()).toBe(true);

    component["rightRailExpanded"].set(false);
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["rightRailExpanded"]()).toBe(false);

    chat.listDrafts.mockReturnValue(of([createDraft("draft-2")]));
    component["loadDrafts"]("workspace-1", "session-1");
    expect(component["rightRailExpanded"]()).toBe(true);
  });

  it("clears review state when a conversation has no draft", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;

    chat.listDrafts.mockReturnValue(of([createDraft("draft-1")]));
    component["loadDrafts"]("workspace-1", "session-1");
    chat.listDrafts.mockReturnValue(of([]));
    component["loadDrafts"]("workspace-1", "session-2");

    expect(component["draft"]()).toBeNull();
    expect(component["rightRailExpanded"]()).toBe(false);
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
    component["rightRailExpanded"].set(true);
    fixture.detectChanges();

    const toggle = fixture.nativeElement.querySelector(
      ".draft-mobile-toggle",
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(toggle.getAttribute("aria-controls")).toBe("assistant-rail");
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
    expect(component["rightRailExpanded"]()).toBe(true);
  });

  it("jumps from a citation marker to the same message's source without navigating", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const answer = (id: string): ChatMessageResponse => ({
      id,
      sessionId: "session-1",
      role: "ASSISTANT",
      content: "Rok je 8 dana [1].",
      status: "COMPLETED",
      correlationId: `corr-${id}`,
      createdAt: "2026-09-15T12:00:00.000Z",
      attachments: [],
      citations: [
        {
          marker: 1,
          articleNumber: "76",
          sourceTitle: "Zakon o obligacionim odnosima",
          sourceUrl: "https://www.paragraf.rs/propisi/zoo.html",
          snippet: "Tekst",
          score: 0.8,
        },
      ],
    });
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);
    component["messages"].set([answer("m1"), answer("m2")]);
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const scrolled: string[] = [];
    host.querySelectorAll<HTMLElement>(".citation-item").forEach((item) => {
      item.scrollIntoView = jest.fn(() => scrolled.push(item.id));
    });
    const links = host.querySelectorAll<HTMLAnchorElement>(
      "a.citation-marker-link",
    );
    expect(links).toHaveLength(2);

    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    links[1].dispatchEvent(click);

    expect(click.defaultPrevented).toBe(true);
    expect(scrolled).toEqual(["message-m2-citation-1"]);
    const target = host.querySelector("#message-m2-citation-1");
    expect(target?.classList.contains("citation-item--flash")).toBe(true);
    expect(document.activeElement).toBe(target);
  });

  it("previews the hovered marker's cited text and hides it on leave or Escape", () => {
    jest.useFakeTimers();
    try {
      const fixture = TestBed.createComponent(AssistantComponent);
      const component = fixture.componentInstance;
      const answer = (id: string, snippet: string): ChatMessageResponse => ({
        id,
        sessionId: "session-1",
        role: "ASSISTANT",
        content: "Rok je 8 dana [1].",
        status: "COMPLETED",
        correlationId: `corr-${id}`,
        createdAt: "2026-09-15T12:00:00.000Z",
        attachments: [],
        citations: [
          {
            marker: 1,
            articleNumber: "76",
            sourceTitle: "Zakon o obligacionim odnosima",
            sourceUrl: "https://www.paragraf.rs/propisi/zoo.html",
            snippet,
            score: 0.8,
          },
        ],
      });
      component["sessions"].set([session]);
      component["selectedSessionId"].set(session.id);
      component["messages"].set([
        answer("m1", "Prvi izvod."),
        answer("m2", "Drugi izvod."),
      ]);
      fixture.detectChanges();

      const host = fixture.nativeElement as HTMLElement;
      const link = host.querySelectorAll<HTMLAnchorElement>(
        "a.citation-marker-link",
      )[1];
      const preview = () =>
        document.querySelector<HTMLElement>(
          ".cdk-overlay-container [role='tooltip']",
        );

      link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
      expect(preview()).toBeNull();
      jest.advanceTimersByTime(300);

      expect(preview()?.textContent).toContain("Drugi izvod.");
      expect(link.getAttribute("aria-describedby")).toBe(preview()?.id);

      link.dispatchEvent(
        new MouseEvent("mouseout", { bubbles: true, relatedTarget: host }),
      );
      jest.advanceTimersByTime(200);
      expect(preview()).toBeNull();
      expect(link.hasAttribute("aria-describedby")).toBe(false);

      link.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
      jest.advanceTimersByTime(300);
      expect(preview()).not.toBeNull();
      link.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      expect(preview()).toBeNull();
    } finally {
      jest.useRealTimers();
    }
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

  it("expands the rail on the matter tab when a brief becomes available", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);

    component["handleEvent"]({
      type: "job.updated",
      workspaceId: "workspace-1",
      sessionId: session.id,
      correlationId: "corr-brief",
      createdAt: "2026-09-15T12:00:00.000Z",
      job: {
        id: "job-brief",
        workspaceId: "workspace-1",
        sessionId: session.id,
        workflowName: "brief-extraction",
        status: "COMPLETED",
        briefResultId: "brief-1",
        correlationId: "corr-brief",
        progressStage: "EXTRACTING_FACTS",
        createdAt: "2026-09-15T12:00:00.000Z",
        updatedAt: "2026-09-15T12:00:01.000Z",
      },
    });

    expect(component["latestBriefId"]()).toBe("brief-1");
    expect(component["rightRailExpanded"]()).toBe(true);
    expect(component["railTab"]()).toBe("matter");
  });

  it("renders the matter link in the rail instead of the message stream", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    chat.previewBrief.mockReturnValue(of(createBriefPreview()));
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);
    component["latestBriefId"].set("brief-1");
    component["rightRailExpanded"].set(true);

    fixture.detectChanges();
    fixture.detectChanges();

    const matterPane = fixture.nativeElement.querySelector(
      ".assistant-rail-pane.is-active app-assistant-matter-link",
    ) as HTMLElement;
    expect(matterPane).not.toBeNull();
    expect(matterPane.textContent).toContain("assistant.matter.confirmCase");
    expect(
      fixture.nativeElement.querySelector(
        ".message-stream app-assistant-matter-link",
      ),
    ).toBeNull();
  });

  it("shows rail tabs and switches panes when both a draft and a brief exist", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    chat.previewBrief.mockReturnValue(of(createBriefPreview()));
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);
    component["draft"].set(createDraft("draft-1"));
    component["rightRailExpanded"].set(true);
    component["latestBriefId"].set("brief-1");
    fixture.detectChanges();

    const tabs = fixture.nativeElement.querySelector(
      ".assistant-rail-tabs",
    ) as HTMLElement;
    expect(tabs).not.toBeNull();
    expect(tabs.textContent).toContain("assistant.rail.draftTab");
    expect(tabs.textContent).toContain("assistant.rail.matterTab");
    expect(
      fixture.nativeElement.querySelector(
        ".assistant-rail-pane.is-active law-draft-review-panel",
      ),
    ).not.toBeNull();

    const matterTab = Array.from(
      fixture.nativeElement.querySelectorAll(".assistant-rail-tabs button"),
    ).find((button) =>
      (button as HTMLButtonElement).textContent?.includes(
        "assistant.rail.matterTab",
      ),
    ) as HTMLButtonElement;
    matterTab.click();
    fixture.detectChanges();

    expect(
      fixture.nativeElement.querySelector(
        ".assistant-rail-pane.is-active app-assistant-matter-link",
      ),
    ).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        ".assistant-rail-pane.is-active law-draft-review-panel",
      ),
    ).toBeNull();
  });

  it("adds an Analiza tab and opens it when a review arrives", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([session]);
    component["selectedSessionId"].set(session.id);
    component["draft"].set(createDraft("draft-1"));
    component["rightRailExpanded"].set(false);
    fixture.detectChanges();

    component["handleEvent"]({
      type: "analysis.updated",
      sessionId: session.id,
      createdAt: "2026-10-07T09:00:00.000Z",
      analysis: createAnalysis("analysis-1"),
    });
    fixture.detectChanges();

    expect(component["rightRailExpanded"]()).toBe(true);
    expect(component["activeRailTab"]()).toBe("analysis");
    const tabs = fixture.nativeElement.querySelector(
      ".assistant-rail-tabs",
    ) as HTMLElement;
    expect(tabs.textContent).toContain("assistant.rail.draftTab");
    expect(tabs.textContent).toContain("assistant.rail.analysisTab");
    expect(
      fixture.nativeElement.querySelector(
        ".assistant-rail-pane.is-active law-contract-review-panel",
      ),
    ).not.toBeNull();

    // A repeated event for the same review never re-expands a collapsed rail.
    component["rightRailExpanded"].set(false);
    component["handleEvent"]({
      type: "analysis.updated",
      sessionId: session.id,
      createdAt: "2026-10-07T09:00:01.000Z",
      analysis: createAnalysis("analysis-1"),
    });
    expect(component["rightRailExpanded"]()).toBe(false);
  });

  it("shows only the review pane when a session has nothing else", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([session]);
    chat.getSession.mockReturnValue(
      of({
        ...session,
        messages: [],
        jobs: [],
        drafts: [],
        analyses: [createAnalysis("analysis-1"), createAnalysis("analysis-2")],
        latestBriefId: null,
      }),
    );

    component["selectSession"]("session-1");
    fixture.detectChanges();

    expect(component["analysis"]()?.id).toBe("analysis-2");
    expect(component["rightRailExpanded"]()).toBe(true);
    expect(fixture.nativeElement.querySelector(".assistant-rail-tabs")).toBeNull();
    expect(
      fixture.nativeElement.querySelector(
        ".assistant-rail-pane.is-active law-contract-review-panel",
      ),
    ).not.toBeNull();
  });

  it("opens the review export in the chosen script", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    const open = jest.spyOn(window, "open").mockReturnValue(null);
    chat.analysisExportUrl.mockReturnValue("https://api.test/export");
    component["analysis"].set(createAnalysis("analysis-1"));

    component["exportAnalysisDocx"]("cyrillic");

    expect(chat.analysisExportUrl).toHaveBeenCalledWith(
      "workspace-1",
      "analysis-1",
      "cyrillic",
    );
    expect(open).toHaveBeenCalledWith(
      "https://api.test/export",
      "_blank",
      "noopener,noreferrer",
    );
    open.mockRestore();
  });

  it("opens the rail for existing content on select and keeps a user collapse across resync", () => {
    const fixture = TestBed.createComponent(AssistantComponent);
    const component = fixture.componentInstance;
    component["sessions"].set([session]);
    chat.getSession.mockReturnValue(
      of({
        ...session,
        messages: [],
        jobs: [],
        drafts: [createDraft("draft-1")],
        latestBriefId: "brief-1",
      }),
    );

    component["selectSession"]("session-1");
    expect(component["rightRailExpanded"]()).toBe(true);

    component["rightRailExpanded"].set(false);
    component["resyncSelectedSession"]();

    expect(component["latestBriefId"]()).toBe("brief-1");
    expect(component["rightRailExpanded"]()).toBe(false);
  });

  describe("scroll position on select", () => {
    const userMessage: ChatMessageResponse = {
      id: "message-user",
      sessionId: "session-1",
      role: "USER",
      content: "Prepare a draft",
      status: "COMPLETED",
      correlationId: "corr-1",
      createdAt: "2026-09-15T11:59:00.000Z",
      attachments: [],
    };

    function selectWith(messages: ChatMessageResponse[]) {
      jest
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation((callback) => {
          callback(0);
          return 0;
        });
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();
      const container = fixture.nativeElement.querySelector(
        ".message-scroll",
      ) as HTMLDivElement;
      Object.defineProperty(container, "scrollHeight", { value: 1200 });
      container.scrollTop = 500;
      fixture.componentInstance["sessions"].set([session]);
      chat.getSession.mockReturnValue(
        of({ ...session, messages, jobs: [], drafts: [] }),
      );

      fixture.componentInstance["selectSession"]("session-1");
      return container;
    }

    afterEach(() => jest.restoreAllMocks());

    it("starts an empty chat's starter cards at the top", () => {
      expect(selectWith([]).scrollTop).toBe(0);
    });

    it("still opens a conversation at its latest message", () => {
      expect(selectWith([userMessage]).scrollTop).toBe(1200);
    });
  });

  describe("starter prompts", () => {
    const starterCards = (fixture: { nativeElement: HTMLElement }) => [
      ...fixture.nativeElement.querySelectorAll<HTMLButtonElement>(
        "law-starter-prompts button",
      ),
    ];

    it("sends a complete starter question in a new conversation", () => {
      chat.createSession.mockReturnValue(of(session));
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      const card = starterCards(fixture).find((button) =>
        button.textContent?.includes("assistant.starter.deadlinesSoon.title"),
      );
      card?.click();

      expect(chat.createSession).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        caseId: null,
      });
      expect(chat.sendMessage).toHaveBeenCalledWith(
        "workspace-1",
        "session-1",
        "assistant.starter.deadlinesSoon.prompt",
        [],
      );
    });

    it("fills the composer for a prompt that needs the user's input", () => {
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      const card = starterCards(fixture).find((button) =>
        button.textContent?.includes("assistant.starter.researchLaw.title"),
      );
      card?.click();

      expect(
        fixture.componentInstance["composerForm"].controls.draft.value,
      ).toBe("assistant.starter.researchLaw.prompt");
      expect(chat.createSession).not.toHaveBeenCalled();
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    const clickCard = (fixture: { nativeElement: HTMLElement }, id: string) =>
      starterCards(fixture)
        .find((button) =>
          button.textContent?.includes(`assistant.starter.${id}.title`),
        )
        ?.click();

    it("sends a picked case by its exact reference without linking the chat", () => {
      chat.createSession.mockReturnValue(of(session));
      starterPicker.open.mockReturnValue(
        of({
          id: "case-7",
          label: "P-7/2026 Naknada štete",
          detail: null,
          reference: "P-7/2026 („Naknada štete“)",
        }),
      );
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      clickCard(fixture, "pickedCaseWork");

      expect(starterPicker.open).toHaveBeenCalledWith("case");
      expect(chat.createSession).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        caseId: null,
      });
      // Untranslated in tests, so the prompt is its key; the reference is a param.
      expect(chat.sendMessage).toHaveBeenCalledWith(
        "workspace-1",
        "session-1",
        "assistant.starter.pickedCaseWork.prompt",
        [],
      );
    });

    it("fills in the picked reference for prompts that take one", () => {
      starterPicker.open.mockReturnValue(
        of({
          id: "case-7",
          label: "P-7/2026 Naknada štete",
          detail: null,
          reference: "P-7/2026",
        }),
      );
      const fixture = TestBed.createComponent(AssistantComponent);
      const translate = jest
        .spyOn(fixture.componentInstance["localization"], "translate")
        .mockImplementation((key, params) =>
          key === "assistant.starter.setDeadline.prompt"
            ? `Postavi rok na predmetu ${params?.["case"]}: `
            : key,
        );
      fixture.detectChanges();

      clickCard(fixture, "setDeadline");

      expect(translate).toHaveBeenCalledWith(
        "assistant.starter.setDeadline.prompt",
        { case: "P-7/2026" },
      );
      expect(
        fixture.componentInstance["composerForm"].controls.draft.value,
      ).toBe("Postavi rok na predmetu P-7/2026: ");
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it("does nothing when the picker is cancelled", () => {
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      clickCard(fixture, "clientOverview");

      expect(starterPicker.open).toHaveBeenCalledWith("client");
      expect(chat.createSession).not.toHaveBeenCalled();
      expect(
        fixture.componentInstance["composerForm"].controls.draft.value,
      ).toBe("");
    });

    it("falls back to attaching a file from the document picker", () => {
      starterPicker.open.mockReturnValue(of("attach"));
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      clickCard(fixture, "analyzeDocument");

      expect(
        fixture.componentInstance["composerForm"].controls.draft.value,
      ).toBe("assistant.starter.analyzeDocument.attachPrompt");
      expect(chat.sendMessage).not.toHaveBeenCalled();
    });

    it("offers case prompts when the chat is opened from a case", () => {
      routeParams["caseId"] = "case-1";
      const fixture = TestBed.createComponent(AssistantComponent);
      fixture.detectChanges();

      const text = starterCards(fixture)
        .map((button) => button.textContent)
        .join(" ");
      expect(text).toContain("assistant.starter.caseSummary.title");
      expect(text).not.toContain("assistant.starter.myTasks.title");
      expect(
        starterCards(fixture).some((button) => button.dataset["pick"]),
      ).toBe(false);
    });
  });
});
