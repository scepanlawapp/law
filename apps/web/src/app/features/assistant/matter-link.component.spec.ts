import { TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { NEVER, of } from "rxjs";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import { BriefApplyPreview, ChatSessionSummary } from "@law/api-interfaces";
import { AssistantMatterLinkComponent } from "./matter-link.component";

const session: ChatSessionSummary = {
  id: "session-1",
  workspaceId: "workspace-1",
  createdByUserId: "user-1",
  status: "ACTIVE",
  isDeleted: false,
  createdAt: "2026-09-15T10:00:00.000Z",
  updatedAt: "2026-09-15T12:00:00.000Z",
};

const preview: BriefApplyPreview = {
  briefId: "brief-1",
  alreadyApplied: false,
  appliedCaseId: null,
  plaintiffName: "Petar Petrović",
  plaintiffAddress: null,
  nameNeedsSplit: true,
  suggestedFirstName: "Petar",
  suggestedLastName: "Petrović",
  clientMatches: [],
  defendantName: "ACME doo",
  defendantAddress: null,
  suggestedCaseName: "Petar Petrović vs. ACME",
  suggestedDescription: "Opis",
  suggestedCaseNumber: "P-1/2026",
  responsibleUserId: "user-1",
  missingFields: [],
  warnings: [],
  confidence: null,
};

describe("AssistantMatterLinkComponent", () => {
  const chat = {
    previewBrief: jest.fn(),
    linkSessionCase: jest.fn(() => NEVER),
    applyBrief: jest.fn(() => NEVER),
    previewBriefTasks: jest.fn(() => NEVER),
    applyBriefTasks: jest.fn(() => NEVER),
  };
  const cases = {
    list: jest.fn(() =>
      of({
        items: [] as Array<{ id: string; caseNumber: string; name: string }>,
        meta: {
          page: 1,
          pageSize: 5,
          totalItems: 0,
          totalPages: 0,
          hasPreviousPage: false,
          hasNextPage: false,
          sort: [],
        },
      }),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    chat.previewBrief.mockReturnValue(of(preview));

    await TestBed.configureTestingModule({
      imports: [AssistantMatterLinkComponent, RouterTestingModule],
      providers: [
        { provide: ChatApiClient, useValue: chat },
        { provide: CasesApiClient, useValue: cases },
      ],
    }).compileComponents();
  });

  it("loads the brief preview and exposes an accessible collapse control", () => {
    const fixture = TestBed.createComponent(AssistantMatterLinkComponent);
    fixture.componentRef.setInput("workspaceId", "workspace-1");
    fixture.componentRef.setInput("session", session);
    fixture.componentRef.setInput("briefId", "brief-1");
    fixture.componentRef.setInput("expanded", true);
    fixture.detectChanges();
    fixture.detectChanges();

    expect(chat.previewBrief).toHaveBeenCalledWith(
      "workspace-1",
      "session-1",
      "brief-1",
    );
    const toggle = fixture.nativeElement.querySelector(
      '[aria-controls="matter-link-content"]',
    ) as HTMLButtonElement;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const content = fixture.nativeElement.querySelector(
      "#matter-link-content",
    ) as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.textContent).toContain("assistant.matter.confirmCase");
  });

  it("collapses to a rail header and emits the expanded change", () => {
    const fixture = TestBed.createComponent(AssistantMatterLinkComponent);
    fixture.componentRef.setInput("workspaceId", "workspace-1");
    fixture.componentRef.setInput("session", session);
    fixture.componentRef.setInput("briefId", "brief-1");
    fixture.componentRef.setInput("expanded", false);
    fixture.detectChanges();

    const panel = fixture.nativeElement.querySelector(
      ".matter-link-panel",
    ) as HTMLElement;
    expect(panel.classList.contains("is-collapsed")).toBe(true);
    expect(
      fixture.nativeElement.querySelector("#matter-link-content"),
    ).toBeNull();

    const emitted: boolean[] = [];
    fixture.componentInstance.expandedChange.subscribe((value) =>
      emitted.push(value),
    );
    const toggle = fixture.nativeElement.querySelector(
      '[aria-controls="matter-link-content"]',
    ) as HTMLButtonElement;
    toggle.click();
    expect(emitted).toEqual([true]);
  });

  it("shows the linked case summary when the session is already linked", () => {
    const fixture = TestBed.createComponent(AssistantMatterLinkComponent);
    fixture.componentRef.setInput("workspaceId", "workspace-1");
    fixture.componentRef.setInput("session", {
      ...session,
      case: {
        id: "case-1",
        caseNumber: "P-1/2026",
        name: "Petar Petrović vs. ACME",
      },
    });
    fixture.componentRef.setInput("briefId", "brief-1");
    fixture.componentRef.setInput("expanded", true);
    fixture.detectChanges();

    const content = fixture.nativeElement.querySelector(
      "#matter-link-content",
    ) as HTMLElement;
    expect(content).not.toBeNull();
    expect(content.textContent).toContain("P-1/2026");
    expect(content.textContent).toContain("assistant.matter.openCase");
    const status = fixture.nativeElement.querySelector(
      ".matter-link-status",
    ) as HTMLElement;
    expect(status.dataset["status"]).toBe("linked");
  });
});