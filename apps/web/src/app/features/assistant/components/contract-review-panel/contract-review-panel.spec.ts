import { TestBed } from "@angular/core/testing";
import { ContractReviewAnalysis } from "@law/api-interfaces";
import { ContractReviewPanelComponent } from "./contract-review-panel";

const analysis: ContractReviewAnalysis = {
  id: "analysis-1",
  sessionId: "session-1",
  caseId: null,
  kind: "CONTRACT_REVIEW",
  documentRef: "att:nda",
  documentTitle: "NDA Alfa",
  contractType: "NDA",
  clientSide: "Beta d.o.o.",
  result: {
    summary: "Jednostran NDA u korist Alfa.",
    keyTerms: [{ label: "Trajanje", value: "neograničeno", clause: "Član 6" }],
    issues: [
      {
        title: "Neograničeno trajanje",
        category: "RISK",
        risk: "HIGH",
        clause: "Član 6",
        quote: "obaveza traje neograničeno",
        explanation: "Nesrazmerno za primaoca.",
        suggestion: "Ograničiti na 3 godine.",
        citations: [1],
      },
      {
        title: "Nejasna definicija",
        category: "RISK",
        risk: "LOW",
        clause: null,
        quote: null,
        explanation: "Široko.",
        suggestion: null,
        citations: [],
      },
    ],
    missingClauses: [
      {
        title: "Vraćanje informacija",
        explanation: "Nema odredbe.",
        suggestion: "Dodati član o vraćanju.",
      },
    ],
    warnings: ["Prilog 1 nije dat."],
  },
  citations: [
    {
      marker: 1,
      articleNumber: "4",
      sourceTitle: "Zakon o zaštiti poslovne tajne",
      sourceUrl: "https://example.test",
      snippet: "…",
      score: 0.8,
    },
  ],
  truncated: true,
  model: "test-model",
  createdAt: "2026-10-07T09:00:00.000Z",
};

describe("ContractReviewPanelComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ContractReviewPanelComponent],
    }).compileComponents();
  });

  function render(input: Partial<{ expanded: boolean }> = {}) {
    const fixture = TestBed.createComponent(ContractReviewPanelComponent);
    fixture.componentRef.setInput("analysis", analysis);
    fixture.componentRef.setInput("expanded", input.expanded ?? true);
    fixture.detectChanges();
    return fixture;
  }

  it("shows the summary, key terms, findings by risk, and missing clauses", () => {
    const element = render().nativeElement as HTMLElement;
    const text = element.textContent ?? "";

    expect(text).toContain("NDA Alfa");
    expect(text).toContain("assistant.review.type.NDA");
    expect(text).toContain("Jednostran NDA u korist Alfa.");
    expect(text).toContain("Beta d.o.o.");
    expect(text).toContain("Trajanje");
    expect(text).toContain("Vraćanje informacija");
    const issues = Array.from(element.querySelectorAll(".review-issue"));
    expect(issues.map((item) => item.getAttribute("data-risk"))).toEqual([
      "HIGH",
      "LOW",
    ]);
    expect(issues[0].textContent).toContain("„obaveza traje neograničeno”");
    expect(issues[0].textContent).toContain("[1]");
    expect(issues[0].textContent).toContain("Ograničiti na 3 godine.");
    expect(element.querySelector(".review-heading-icon")?.classList).toContain(
      "has-risk",
    );
  });

  it("counts the truncation notice among the notes", () => {
    const element = render().nativeElement as HTMLElement;
    expect(element.textContent).toContain("assistant.review.notes (2)");
  });

  it("emits export scripts and collapse changes", () => {
    const fixture = render();
    const exports: string[] = [];
    const expanded: boolean[] = [];
    fixture.componentInstance.exportDocx.subscribe((script) =>
      exports.push(script),
    );
    fixture.componentInstance.expandedChange.subscribe((value) =>
      expanded.push(value),
    );
    const buttons = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        ".review-panel-footer button",
      ),
    ) as HTMLButtonElement[];
    buttons[0].click();
    buttons[1].click();
    (
      fixture.nativeElement.querySelector(
        '[aria-controls="contract-review-content"]',
      ) as HTMLButtonElement
    ).click();

    expect(exports).toEqual(["latin", "cyrillic"]);
    expect(expanded).toEqual([false]);
  });

  it("collapses to the header", () => {
    const element = render({ expanded: false }).nativeElement as HTMLElement;
    expect(element.querySelector("#contract-review-content")).toBeNull();
    expect(element.querySelector(".review-panel")?.classList).toContain(
      "is-collapsed",
    );
  });
});
