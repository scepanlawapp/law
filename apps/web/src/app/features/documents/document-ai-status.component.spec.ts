import { ComponentFixture, TestBed } from "@angular/core/testing";
import { DocumentAiStatus } from "@law/api-interfaces";
import { LocalizationService } from "../../core/localization/localization.service";
import { DocumentAiStatusComponent } from "./document-ai-status.component";

describe("DocumentAiStatusComponent", () => {
  function render(
    status: DocumentAiStatus,
  ): ComponentFixture<DocumentAiStatusComponent> {
    TestBed.configureTestingModule({
      imports: [DocumentAiStatusComponent],
      providers: [
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocumentAiStatusComponent);
    fixture.componentRef.setInput("status", status);
    fixture.detectChanges();
    return fixture;
  }

  const root = (fixture: ComponentFixture<unknown>) =>
    fixture.nativeElement as HTMLElement;

  it.each<DocumentAiStatus>([
    "OFF",
    "QUEUED",
    "PROCESSING",
    "READY",
    "FAILED",
    "UNSUPPORTED",
  ])("renders a focusable labelled icon for %s", (status) => {
    const fixture = render(status);
    const icon = root(fixture).querySelector('[role="img"]') as HTMLElement;
    expect(icon).not.toBeNull();
    expect(icon.getAttribute("tabindex")).toBe("0");
    expect(icon.getAttribute("aria-label")).toBe(
      `documents.ai.status.${status}`,
    );
    expect(icon.querySelector("ng-icon")).not.toBeNull();
  });

  it.each<[DocumentAiStatus, boolean]>([
    ["OFF", false],
    ["QUEUED", true],
    ["PROCESSING", true],
    ["READY", false],
    ["FAILED", false],
    ["UNSUPPORTED", false],
  ])("shows a spinner for %s: %s", (status, spinner) => {
    const fixture = render(status);
    expect(root(fixture).querySelector("hlm-spinner") !== null).toBe(spinner);
  });

  it("uses a different icon per terminal status", () => {
    const fixture = render("OFF");
    const names = (["OFF", "READY", "FAILED", "UNSUPPORTED"] as const).map(
      (status) => {
        fixture.componentRef.setInput("status", status);
        fixture.detectChanges();
        return fixture.componentInstance.icon();
      },
    );
    expect(new Set(names).size).toBe(4);
  });
});
