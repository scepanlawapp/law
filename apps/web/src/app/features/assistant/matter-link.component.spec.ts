import { TestBed } from "@angular/core/testing";
import { RouterTestingModule } from "@angular/router/testing";
import { NEVER, of } from "rxjs";
import { ChatApiClient, CasesApiClient } from "@law/api-clients";
import {
  BriefApplyPreview,
  BriefTaskPreview,
  ChatSessionSummary,
} from "@law/api-interfaces";
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
      {},
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

  it("shows the parties and reloads the preview for another client party", () => {
    const fixture = TestBed.createComponent(AssistantMatterLinkComponent);
    fixture.componentRef.setInput("workspaceId", "workspace-1");
    fixture.componentRef.setInput("session", session);
    fixture.componentRef.setInput("briefId", "brief-1");
    fixture.componentRef.setInput("expanded", true);
    fixture.detectChanges();
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain("assistant.documentType.LAWSUIT");
    expect(text).toContain("assistant.matter.clientParty");
    expect(
      fixture.nativeElement.querySelectorAll("hlm-radio").length,
    ).toBe(2);

    chat.previewBrief.mockReturnValue(
      of({
        ...preview,
        clientRole: "defendant",
        clientPartyName: "ACME doo",
        opposingPartyName: "Petar Petrović",
      }),
    );
    fixture.componentInstance.clientRole.setValue("defendant");
    fixture.detectChanges();

    expect(chat.previewBrief).toHaveBeenLastCalledWith(
      "workspace-1",
      "session-1",
      "brief-1",
      { clientRole: "defendant" },
    );
    expect(fixture.componentInstance.form.getRawValue().opposingPartyName).toBe(
      "Petar Petrović",
    );
    expect(chat.previewBrief).toHaveBeenCalledTimes(2);
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

  it("groups task proposals, preselects missing data and sends edited due dates", () => {
    const tasks: BriefTaskPreview = {
      briefId: "brief-1",
      caseId: "case-1",
      proposals: [
        {
          key: "missing:defendantAddress:0",
          source: "missing",
          fieldKey: "defendantAddress",
          title: "Pribaviti adresu tuženog",
          description: "",
          assigneeUserId: "user-1",
          priority: "NORMAL",
          dueDate: "2026-09-30",
          selectedByDefault: true,
          alreadyApplied: false,
        },
        {
          key: "missing:serviceDate:1",
          source: "missing",
          fieldKey: "serviceDate",
          title: "Utvrditi datum dostavljanja osporenog akta",
          description: "",
          assigneeUserId: "user-1",
          priority: "HIGH",
          dueDate: "2026-09-28",
          selectedByDefault: true,
          alreadyApplied: true,
        },
        {
          key: "evidence:0",
          source: "evidence",
          title: "Pribaviti dokaz: Ugovor o radu",
          description: "",
          assigneeUserId: "user-1",
          priority: "NORMAL",
          dueDate: "2026-09-30",
          selectedByDefault: false,
          alreadyApplied: false,
        },
      ],
    };
    chat.previewBrief.mockReturnValue(
      of({ ...preview, alreadyApplied: true, appliedCaseId: "case-1" }),
    );
    chat.previewBriefTasks.mockReturnValue(of(tasks));
    const fixture = TestBed.createComponent(AssistantMatterLinkComponent);
    fixture.componentRef.setInput("workspaceId", "workspace-1");
    fixture.componentRef.setInput("session", session);
    fixture.componentRef.setInput("briefId", "brief-1");
    fixture.detectChanges();
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    const groups = element.querySelectorAll(".matter-task-group");
    expect(groups.length).toBe(2);
    expect(element.querySelectorAll(".matter-task.is-created").length).toBe(1);
    expect([...fixture.componentInstance.selectedTaskKeys()]).toEqual([
      "missing:defendantAddress:0",
    ]);

    const due = element.querySelector(
      ".matter-task-due",
    ) as HTMLInputElement;
    expect(due.value).toBe("2026-09-30");
    due.value = "2026-10-02";
    due.dispatchEvent(new Event("change"));
    fixture.componentInstance.toggleGroup("evidence");
    fixture.componentInstance.confirmTasks();

    expect(chat.applyBriefTasks).toHaveBeenCalledWith(
      "workspace-1",
      "session-1",
      "brief-1",
      {
        tasks: [
          { key: "missing:defendantAddress:0", dueDate: "2026-10-02" },
          { key: "evidence:0" },
        ],
      },
    );
  });
});
