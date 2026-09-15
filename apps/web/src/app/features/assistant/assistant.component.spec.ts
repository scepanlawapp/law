import { signal } from "@angular/core";
import { TestBed } from "@angular/core/testing";
import { NEVER, of } from "rxjs";
import { ChatApiClient } from "@law/api-clients";
import { DraftResultResponse } from "@law/api-interfaces";
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
          useValue: {
            error: jest.fn(),
            success: jest.fn(),
          },
        },
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
    expect(trigger.getAttribute("aria-label")).toBe(
      "assistant.conversations",
    );
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
});
