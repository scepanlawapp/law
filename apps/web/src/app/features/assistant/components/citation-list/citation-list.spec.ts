import { TestBed } from "@angular/core/testing";
import { LegalCitationResponse } from "@law/api-interfaces";
import { LocalizationService } from "../../../../core/localization/localization.service";
import { CitationListComponent } from "./citation-list";

function citation(
  marker: number,
  articleNumber: string | null,
): LegalCitationResponse {
  return {
    marker,
    articleNumber,
    sourceTitle: "Izvor",
    sourceUrl: "https://www.paragraf.rs/propisi/x.html",
    snippet: "Tekst",
    score: 0.8,
  };
}

describe("CitationListComponent", () => {
  it("labels articles, tariff items, and general provisions", async () => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      key === "assistant.sourceArticle" ? `Član ${params?.["number"]}` : key;
    await TestBed.configureTestingModule({
      imports: [CitationListComponent],
      providers: [{ provide: LocalizationService, useValue: { translate } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CitationListComponent);
    fixture.componentRef.setInput("citations", [
      citation(1, "76"),
      citation(2, "Tarifni broj 5"),
      citation(3, null),
    ]);
    fixture.detectChanges();

    const headings = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll(
        ".citation-heading strong",
      ),
    ).map((element) => element.textContent?.trim());
    expect(headings).toEqual([
      "Član 76",
      "Tarifni broj 5",
      "assistant.sourceGeneralProvision",
    ]);
  });

  it("gives each entry a focusable anchor under the given prefix", async () => {
    await TestBed.configureTestingModule({
      imports: [CitationListComponent],
      providers: [
        { provide: LocalizationService, useValue: { translate: String } },
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(CitationListComponent);
    fixture.componentRef.setInput("citations", [citation(1, "76")]);
    fixture.componentRef.setInput("idPrefix", "message-m1-citation");
    fixture.detectChanges();

    const item = (fixture.nativeElement as HTMLElement).querySelector(
      ".citation-item",
    ) as HTMLElement;
    expect(item.id).toBe("message-m1-citation-1");
    expect(item.getAttribute("tabindex")).toBe("-1");
  });
});
