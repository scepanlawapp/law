import { TestBed } from "@angular/core/testing";
import {
  CasesApiClient,
  ClientsApiClient,
  DocumentsApiClient,
} from "@law/api-clients";
import { DocumentDetail } from "@law/api-interfaces";
import { BrnDialogRef } from "@spartan-ng/brain/dialog";
import { of, throwError } from "rxjs";
import { LocalizationService } from "../../../core/localization/localization.service";
import { DocumentAssociationsDialogComponent } from "./document-associations-dialog.component";
import { DocumentAssociationsDialogContext } from "./document-associations-dialog.models";

let dialogContext: DocumentAssociationsDialogContext;

jest.mock("@spartan-ng/brain/dialog", () => ({
  ...jest.requireActual("@spartan-ng/brain/dialog"),
  injectBrnDialogContext: () => dialogContext,
}));

describe("DocumentAssociationsDialogComponent", () => {
  const dialogRef = { close: jest.fn() };
  const documents = { update: jest.fn() };
  const cases = { list: jest.fn() };
  const clients = { list: jest.fn() };
  const savedDocument = { id: "doc-1" } as DocumentDetail;

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

  function render() {
    TestBed.configureTestingModule({
      imports: [DocumentAssociationsDialogComponent],
      providers: [
        { provide: BrnDialogRef, useValue: dialogRef },
        { provide: DocumentsApiClient, useValue: documents },
        { provide: CasesApiClient, useValue: cases },
        { provide: ClientsApiClient, useValue: clients },
        {
          provide: LocalizationService,
          useValue: { translate: (key: string) => key },
        },
      ],
    });
    const fixture = TestBed.createComponent(
      DocumentAssociationsDialogComponent,
    );
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    dialogContext = {
      documentId: "doc-1",
      documentTitle: "Complaint",
      caseOptions: [{ id: "case-1", label: "P-1/2026 Complaint" }],
      clientOptions: [{ id: "client-1", label: "Client One" }],
    };
    dialogRef.close.mockReset();
    documents.update.mockReset().mockReturnValue(of(savedDocument));
    cases.list.mockReset().mockReturnValue(of({ items: [] }));
    clients.list.mockReset().mockReturnValue(of({ items: [] }));
  });

  it("submits both selected relationship arrays and closes with the saved document", () => {
    const fixture = render();
    const component = fixture.componentInstance;
    component.setCaseIds(["case-2"]);
    component.setClientIds(["client-2"]);

    component.save();

    expect(documents.update).toHaveBeenCalledWith("doc-1", {
      caseIds: ["case-2"],
      clientIds: ["client-2"],
    });
    expect(dialogRef.close).toHaveBeenCalledWith(savedDocument);
    expect(component.saving()).toBe(false);
  });

  it("keeps the dialog open and exposes an error when saving fails", () => {
    documents.update.mockReturnValue(throwError(() => new Error("failed")));
    const fixture = render();

    fixture.componentInstance.save();

    expect(dialogRef.close).not.toHaveBeenCalled();
    expect(fixture.componentInstance.saveError()).toBe(true);
    expect(fixture.componentInstance.saving()).toBe(false);
  });

  it("preserves fixed client context and scopes case search to that client", () => {
    dialogContext = { ...dialogContext, fixedClientId: "client-1" };
    const fixture = render();

    expect(fixture.componentInstance.allowClientPicker).toBe(false);
    expect(fixture.componentInstance.selectedClientIds()).toContain("client-1");
    expect(cases.list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 20,
      search: undefined,
      clientIds: ["client-1"],
    });
    expect(clients.list).not.toHaveBeenCalled();
  });
});
