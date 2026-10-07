import { TestBed } from "@angular/core/testing";
import { CaseTimelineAnalysis } from "@law/api-interfaces";
import {
  CaseTimelinePanelComponent,
  formatTimelineDate,
} from "./case-timeline-panel";

const analysis: CaseTimelineAnalysis = {
  id: "analysis-1",
  sessionId: "session-1",
  caseId: "case-1",
  kind: "CASE_TIMELINE",
  documentRef: "case:case-1",
  documentTitle: "Predmet P-1/2026",
  citations: [],
  truncated: false,
  model: "test-model",
  createdAt: "2026-10-07T09:00:00.000Z",
  result: {
    summary: "Spor oko ugovora o delu.",
    openQuestions: ["Datum dostavljanja presude?"],
    warnings: [],
    events: [
      {
        date: "2025-01-10",
        dateText: null,
        kind: "CONTRACT",
        title: "Zaključen ugovor",
        description: "Alfa i Petar.",
        quote: null,
        sourceRef: "doc:ugovor",
        sourceTitle: "Ugovor",
      },
      {
        date: "2026-03",
        dateText: null,
        kind: "FILING",
        title: "Podneta tužba",
        description: "",
        quote: null,
        sourceRef: "doc:tuzba",
        sourceTitle: "Tužba",
      },
      {
        date: "2026-03-15",
        dateText: "15.03.2026.",
        kind: "DECISION",
        title: "Odbijen zahtev",
        description: "Prvostepena presuda.",
        quote: "sud je odbio tužbeni zahtev",
        sourceRef: "doc:presuda",
        sourceTitle: "Presuda",
      },
      {
        date: null,
        dateText: "početkom godine",
        kind: "OTHER",
        title: "Pregovori",
        description: "",
        quote: null,
        sourceRef: "doc:ugovor",
        sourceTitle: "Ugovor",
      },
    ],
    sources: [
      {
        ref: "doc:presuda",
        title: "Presuda",
        status: "READ",
        summary: "Prvostepena presuda.",
        eventCount: 1,
      },
      {
        ref: "att:sken",
        title: "Sken",
        status: "NO_TEXT",
        summary: null,
        eventCount: 0,
      },
    ],
  },
};

describe("formatTimelineDate", () => {
  it("formats full and partial dates and falls back to the written date", () => {
    const [contract, filing, decision, undated] = analysis.result.events;
    expect(formatTimelineDate(contract)).toBe("10.01.2025.");
    expect(formatTimelineDate(filing)).toBe("03.2026.");
    expect(formatTimelineDate(decision)).toBe("15.03.2026.");
    expect(formatTimelineDate(undated)).toBe("početkom godine");
    expect(formatTimelineDate({ ...undated, dateText: null })).toBeNull();
  });
});

describe("CaseTimelinePanelComponent", () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CaseTimelinePanelComponent],
    }).compileComponents();
  });

  function render(expanded = true) {
    const fixture = TestBed.createComponent(CaseTimelinePanelComponent);
    fixture.componentRef.setInput("analysis", analysis);
    fixture.componentRef.setInput("expanded", expanded);
    fixture.detectChanges();
    return fixture;
  }

  it("groups events by year with undated events last", () => {
    const element = render().nativeElement as HTMLElement;
    const years = Array.from(element.querySelectorAll(".timeline-year h4")).map(
      (heading) => heading.textContent?.trim(),
    );
    expect(years).toEqual(["2025", "2026", "assistant.timeline.undated"]);
    const decision = element.querySelector(
      '.timeline-event[data-kind="DECISION"]',
    ) as HTMLElement;
    expect(decision.textContent).toContain("15.03.2026.");
    expect(decision.textContent).toContain("„sud je odbio tužbeni zahtev”");
    expect(decision.textContent).toContain("Presuda");
    expect(element.textContent).toContain("Datum dostavljanja presude?");
  });

  it("lists the documents with their read status", () => {
    const fixture = render();
    fixture.componentInstance["sourcesExpanded"].set(true);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? "";
    expect(text).toContain("assistant.timeline.documents (2)");
    expect(text).toContain("assistant.timeline.sourceStatus.NO_TEXT");
  });

  it("collapses to the header and emits the change", () => {
    const fixture = render();
    const changes: boolean[] = [];
    fixture.componentInstance.expandedChange.subscribe((value) =>
      changes.push(value),
    );
    (
      fixture.nativeElement.querySelector(
        '[aria-controls="case-timeline-content"]',
      ) as HTMLButtonElement
    ).click();
    expect(changes).toEqual([false]);

    const collapsed = render(false).nativeElement as HTMLElement;
    expect(collapsed.querySelector("#case-timeline-content")).toBeNull();
  });
});
