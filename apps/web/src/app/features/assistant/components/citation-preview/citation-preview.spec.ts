import { TestBed } from "@angular/core/testing";
import { LocalizationService } from "../../../../core/localization/localization.service";
import { CitationPreviewComponent } from "./citation-preview";

describe("CitationPreviewComponent", () => {
  it("renders the cited article, snippet, and source link as a tooltip", async () => {
    const translate = (key: string, params?: Record<string, unknown>) =>
      key === "assistant.sourceArticle" ? `Član ${params?.["number"]}` : key;
    await TestBed.configureTestingModule({
      imports: [CitationPreviewComponent],
      providers: [{ provide: LocalizationService, useValue: { translate } }],
    }).compileComponents();

    const fixture = TestBed.createComponent(CitationPreviewComponent);
    fixture.componentRef.setInput("previewId", "preview-1");
    fixture.componentRef.setInput("citation", {
      marker: 2,
      articleNumber: "76",
      sourceTitle: "Zakon o obligacionim odnosima",
      sourceUrl: "https://www.paragraf.rs/propisi/zoo.html",
      snippet: "Rok zastarelosti je tri godine.",
      score: 0.84,
    });
    fixture.detectChanges();

    const host = fixture.nativeElement as HTMLElement;
    const tooltip = host.querySelector('[role="tooltip"]') as HTMLElement;
    expect(tooltip.id).toBe("preview-1");
    expect(tooltip.textContent).toContain("Član 76");
    expect(tooltip.textContent).toContain("Zakon o obligacionim odnosima");
    expect(tooltip.textContent).toContain("Rok zastarelosti je tri godine.");
    expect(
      host.querySelector(".citation-preview-link")?.getAttribute("href"),
    ).toBe("https://www.paragraf.rs/propisi/zoo.html");
  });
});
