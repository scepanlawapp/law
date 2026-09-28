import { TestBed } from "@angular/core/testing";
import { DraftApprovalStatus, DraftResultResponse } from "@law/api-interfaces";
import { DraftReviewPanelComponent } from "./draft-review-panel";

const draft: DraftResultResponse = {
  id: "draft-1",
  jobId: "job-1",
  workspaceId: "workspace-1",
  sessionId: "session-1",
  messageId: null,
  briefResultId: null,
  documentText: "Initial draft",
  warnings: ["Check the filing date"],
  missingFields: [{ key: "competentCourt", label: "Nadležni sud" }],
  citations: [],
  promptChars: 100,
  truncated: false,
  model: "test-model",
  approvalStatus: "READY_FOR_SIGNOFF",
  createdAt: "2026-09-15T12:00:00.000Z",
};

describe("DraftReviewPanelComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DraftReviewPanelComponent],
    }).compileComponents();
  });

  it("emits controlled collapse changes with accessible state", () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", draft);
    fixture.componentRef.setInput("text", "Edited draft");
    fixture.componentRef.setInput("expanded", true);
    fixture.detectChanges();

    const emitted: boolean[] = [];
    fixture.componentInstance.expandedChange.subscribe((value) =>
      emitted.push(value),
    );
    const toggle = fixture.nativeElement.querySelector(
      '[aria-controls="draft-review-content"]',
    ) as HTMLButtonElement;

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    toggle.click();
    expect(emitted).toEqual([false]);

    fixture.componentRef.setInput("expanded", false);
    fixture.detectChanges();
    expect(
      fixture.nativeElement.querySelector("#draft-review-content"),
    ).toBeNull();
  });

  it("restores draft and note values after collapsing", async () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", draft);
    fixture.componentRef.setInput("text", "Edited draft text");
    fixture.componentRef.setInput("note", "Reviewer note");
    fixture.componentRef.setInput("expanded", false);
    fixture.detectChanges();

    fixture.componentRef.setInput("expanded", true);
    fixture.detectChanges();
    await fixture.whenStable();

    const documentText = fixture.nativeElement.querySelector(
      "#draft-document-text",
    ) as HTMLTextAreaElement;
    const reviewNote = fixture.nativeElement.querySelector(
      "#draft-review-note",
    ) as HTMLTextAreaElement;
    expect(documentText.value).toBe("Edited draft text");
    expect(reviewNote.value).toBe("Reviewer note");
  });

  it("emits script and workflow actions", () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", draft);
    fixture.componentRef.setInput("text", draft.documentText);
    fixture.detectChanges();

    const scriptChanges: string[] = [];
    fixture.componentInstance.scriptChange.subscribe((value) =>
      scriptChanges.push(value),
    );
    const outputs = {
      exportDocx: jest.spyOn(fixture.componentInstance.exportDocx, "emit"),
      save: jest.spyOn(fixture.componentInstance.save, "emit"),
      requestChanges: jest.spyOn(
        fixture.componentInstance.requestChanges,
        "emit",
      ),
      reject: jest.spyOn(fixture.componentInstance.reject, "emit"),
      approve: jest.spyOn(fixture.componentInstance.approve, "emit"),
    };

    const scriptButtons = fixture.nativeElement.querySelectorAll(
      ".draft-script-toggle button",
    ) as NodeListOf<HTMLButtonElement>;
    scriptButtons[1].click();
    expect(scriptChanges).toEqual(["cyrillic"]);

    const actionButtons = fixture.nativeElement.querySelectorAll(
      ".draft-review-footer button",
    ) as NodeListOf<HTMLButtonElement>;
    actionButtons.forEach((button) => button.click());
    expect(outputs.exportDocx).toHaveBeenCalledTimes(1);
    expect(outputs.save).toHaveBeenCalledTimes(1);
    expect(outputs.requestChanges).toHaveBeenCalledTimes(1);
    expect(outputs.reject).toHaveBeenCalledTimes(1);
    expect(outputs.approve).toHaveBeenCalledTimes(1);
  });

  it.each<DraftApprovalStatus>([
    "DRAFT",
    "READY_FOR_SIGNOFF",
    "APPROVED",
    "REJECTED",
    "CHANGES_REQUESTED",
  ])("exposes the %s status for translated semantic styling", (status) => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", {
      ...draft,
      approvalStatus: status,
    });
    fixture.componentRef.setInput("text", draft.documentText);
    fixture.detectChanges();

    const badge = fixture.nativeElement.querySelector(
      ".draft-status",
    ) as HTMLElement;
    expect(badge.dataset["status"]).toBe(status);
    expect(badge.textContent?.trim()).toBe(`assistant.draftStatus.${status}`);
  });

  it("lists placeholders to complete and fills them in the text", () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", draft);
    fixture.componentRef.setInput(
      "text",
      "Sud: [UNOS POTREBAN: naziv suda], adresa [UNOS POTREBAN: adresa tuženog], [UNOS POTREBAN: naziv suda]",
    );
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll(
      ".draft-todo-item",
    ) as NodeListOf<HTMLElement>;
    expect(items.length).toBe(2);
    expect(items[0].textContent).toContain("Naziv suda");
    expect(items[0].textContent).toContain("assistant.occurrences");

    const emitted: string[] = [];
    fixture.componentInstance.textChange.subscribe((value) =>
      emitted.push(value),
    );
    const input = items[0].querySelector("input") as HTMLInputElement;
    input.value = "Osnovni sud u Nišu";
    input.dispatchEvent(new Event("input"));
    fixture.detectChanges();
    (items[0].querySelector("form") as HTMLFormElement).dispatchEvent(
      new Event("submit"),
    );
    expect(emitted).toEqual([
      "Sud: Osnovni sud u Nišu, adresa [UNOS POTREBAN: adresa tuženog], Osnovni sud u Nišu",
    ]);
  });

  it("shows a complete state and notes instead of placeholder warnings", () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", draft);
    fixture.componentRef.setInput("text", "TUŽBA bez praznina");
    fixture.detectChanges();

    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector(".draft-todo")).toBeNull();
    expect(element.querySelector(".draft-alert-success")?.textContent).toContain(
      "assistant.allFilled",
    );
    expect(element.textContent).toContain("assistant.draftNotes");
  });

  it("hides reject and approve once the draft is approved", () => {
    const fixture = TestBed.createComponent(DraftReviewPanelComponent);
    fixture.componentRef.setInput("draft", {
      ...draft,
      approvalStatus: "APPROVED",
    });
    fixture.componentRef.setInput("text", draft.documentText);
    fixture.detectChanges();

    const labels = Array.from(
      fixture.nativeElement.querySelectorAll(".draft-review-footer button"),
    ).map((button) => (button as HTMLElement).textContent?.trim());
    expect(labels).not.toContain("assistant.approveDraft");
    expect(labels).not.toContain("assistant.rejectDraft");
    expect(labels).toContain("assistant.exportDocx");
  });
});
