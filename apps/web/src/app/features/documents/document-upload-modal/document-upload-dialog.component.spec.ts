import { TestBed } from "@angular/core/testing";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
} from "@law/api-clients";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { ConfirmDialogService } from "../../../shared/ui/confirm-dialog/confirm-dialog.service";
import { DocumentUploadDialogComponent } from "./document-upload-dialog.component";
import { DocumentUploadDialogContext } from "./document-upload-dialog.models";
import { DocumentUploadQueue } from "./document-upload.queue";

let dialogContext: DocumentUploadDialogContext;

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => dialogContext,
}));

describe("DocumentUploadDialogComponent AI access", () => {
  beforeAll(() => {
    globalThis.ResizeObserver ??= class {
      observe(): void {
        // jsdom has no layout.
      }
      unobserve(): void {
        // jsdom has no layout.
      }
      disconnect(): void {
        // jsdom has no layout.
      }
    };
  });

  function render(context: DocumentUploadDialogContext) {
    dialogContext = context;
    TestBed.configureTestingModule({
      imports: [DocumentUploadDialogComponent],
      providers: [
        { provide: BrnDialogRef, useValue: { close: jest.fn() } },
        { provide: DocumentsApiClient, useValue: {} },
        {
          provide: CasesApiClient,
          useValue: { list: jest.fn().mockReturnValue(of({ items: [] })) },
        },
        {
          provide: ClientsApiClient,
          useValue: { list: jest.fn().mockReturnValue(of({ items: [] })) },
        },
        { provide: ConfirmDialogService, useValue: { confirm: jest.fn() } },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    const fixture = TestBed.createComponent(DocumentUploadDialogComponent);
    fixture.detectChanges();
    return fixture;
  }

  function queueOf(component: DocumentUploadDialogComponent) {
    return (component as unknown as { queue: DocumentUploadQueue }).queue;
  }

  it("forwards the header switch to queue.setAllAiAccess", () => {
    const fixture = render({ mode: "create" });
    const component = fixture.componentInstance;
    const spy = jest.spyOn(queueOf(component), "setAllAiAccess");
    const toggle = (fixture.nativeElement as HTMLElement).querySelector(
      "#upload-ai-access-all",
    ) as HTMLElement;
    expect(toggle).not.toBeNull();

    toggle.click();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith(true);
    expect(component.aiAccessAll()).toBe(true);
  });

  it("shows the AI column in create mode", () => {
    const fixture = render({ mode: "create" });
    expect(fixture.componentInstance.showAiAccess).toBe(true);
    expect(fixture.componentInstance.tableColumns).toBe(7);
  });

  it("hides the switch and the AI column in version mode", () => {
    const fixture = render({ mode: "version", documentId: "doc-1" });
    const host = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.showAiAccess).toBe(false);
    expect(fixture.componentInstance.tableColumns).toBe(6);
    expect(host.querySelector("#upload-ai-access-all")).toBeNull();
    expect(host.querySelector("#upload-ai-access-info")).toBeNull();
  });

  it("offers the tooltip on a focusable labelled button", () => {
    const fixture = render({ mode: "create" });
    const info = (fixture.nativeElement as HTMLElement).querySelector(
      "#upload-ai-access-info",
    ) as HTMLButtonElement | null;
    expect(info).not.toBeNull();
    expect(info?.tagName).toBe("BUTTON");
    expect(info?.getAttribute("type")).toBe("button");
    expect(info?.getAttribute("aria-label")).toBe("documents.ai.accessInfo");
    expect(info?.tabIndex).toBeGreaterThanOrEqual(0);
  });
});
