import { DocumentSummary } from "@law/api-interfaces";
import { of } from "rxjs";
import { DocumentsComponent } from "./documents.component";

describe("DocumentsComponent state helpers", () => {
  const createComponent = () =>
    Object.create(DocumentsComponent.prototype) as DocumentsComponent;

  const createDocument = (
    overrides: Partial<DocumentSummary> = {},
  ): DocumentSummary => ({
    id: "doc-1",
    title: "Complaint",
    category: null,
    archived: false,
    archivedAt: null,
    cases: [
      {
        id: "case-1",
        caseNumber: "P-1/2026",
        name: "Complaint case",
        status: "ACTIVE",
        priority: "NORMAL",
      },
    ],
    clients: [
      {
        id: "client-1",
        clientNumber: "CL-1",
        type: "INDIVIDUAL",
        displayName: "Client One",
        status: "ACTIVE",
      },
    ],
    currentVersion: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  });

  it("treats unlinked documents as needs linking", () => {
    const component = createComponent();
    const linked = createDocument();
    const unlinked = createDocument({ cases: [], clients: [] });

    expect(component.isNeedsLinking(linked)).toBe(false);
    expect(component.isNeedsLinking(unlinked)).toBe(true);
  });

  it("uses immutable import time instead of metadata update time", () => {
    const component = createComponent();
    component.formatDateOnly = (value) => value ?? "";
    expect(component.lastUpdatedInfo(createDocument())).toBe(
      "2026-09-01T10:00:00.000Z",
    );
  });

  it("keeps all linked case and client values in the tooltip", () => {
    const component = createComponent();
    const document = createDocument();
    document.clients.push({
      ...document.clients[0],
      id: "second",
      displayName: "Client Two",
    });
    expect(component.linkedInfo(document)).toContain("Client One; Client Two");
    expect(component.getLinkedClientName(document)).toBe(
      "Client One; Client Two",
    );
  });

  it("applies fixed case context without adding a client filter", () => {
    const caseComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => "fixed-case",
        fixedClientId: () => undefined,
        currentFolderId: () => null,
        selectedTab: () => "all",
        selectedCaseIds: () => ["selected-case"],
        selectedClientId: { value: "" },
        selectedCategory: { value: "" },
        searchControl: { value: "" },
        page: () => 1,
      },
    ) as DocumentsComponent;

    expect(caseComponent.buildListQuery("false")).toMatchObject({
      caseIds: ["fixed-case"],
    });
    expect(caseComponent.buildListQuery("false").clientId).toBeUndefined();
  });

  it("keeps case selection available within a fixed client", () => {
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => undefined,
        fixedClientId: () => "fixed-client",
        currentFolderId: () => null,
        selectedTab: () => "all",
        selectedCaseIds: () => ["selected-case"],
        selectedClientId: { value: "" },
        selectedCategory: { value: "" },
        searchControl: { value: "" },
        page: () => 1,
      },
    ) as DocumentsComponent;

    expect(component.buildListQuery("false")).toMatchObject({
      caseIds: ["selected-case"],
      clientId: "fixed-client",
    });
  });

  it("hides fixed relationship filters but keeps case selection for a client", () => {
    const caseComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => "fixed-case",
        fixedClientId: () => "fixed-client",
      },
    ) as DocumentsComponent;
    const clientComponent = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        fixedCaseId: () => undefined,
        fixedClientId: () => "fixed-client",
      },
    ) as DocumentsComponent;

    expect(caseComponent.showCaseFilter()).toBe(false);
    expect(caseComponent.showClientFilter()).toBe(false);
    expect(clientComponent.showCaseFilter()).toBe(true);
    expect(clientComponent.showClientFilter()).toBe(false);
  });

  it("refreshes the list and emits documentsChanged after associations save", () => {
    const document = createDocument();
    const updated = { ...document, clients: [], cases: [] };
    const associationsDialog = { open: jest.fn(() => of(updated)) };
    const changes = { emit: jest.fn() };
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        associationsDialog,
        fixedCaseId: () => undefined,
        fixedClientId: () => undefined,
        destroyRef: {
          destroyed: false,
          onDestroy: () => () => undefined,
        },
        documentsChanged: changes,
        toast: { success: jest.fn() },
        localization: { translate: (key: string) => key },
        load: jest.fn(),
      },
    ) as DocumentsComponent;

    component.openAssociations(document);

    expect(associationsDialog.open).toHaveBeenCalledWith({
      documentId: document.id,
      documentTitle: document.title,
      caseOptions: [{ id: "case-1", label: "P-1/2026 — Complaint case" }],
      clientOptions: [{ id: "client-1", label: "Client One" }],
      fixedCaseId: undefined,
      fixedClientId: undefined,
    });
    expect(component.load).toHaveBeenCalledTimes(1);
    expect(changes.emit).toHaveBeenCalledTimes(1);
  });

  it("does not refresh or emit documentsChanged when association editing is cancelled", () => {
    const associationsDialog = { open: jest.fn(() => of(undefined)) };
    const changes = { emit: jest.fn() };
    const component = Object.assign(
      Object.create(DocumentsComponent.prototype),
      {
        associationsDialog,
        fixedCaseId: () => undefined,
        fixedClientId: () => undefined,
        destroyRef: {
          destroyed: false,
          onDestroy: () => () => undefined,
        },
        documentsChanged: changes,
        toast: { success: jest.fn() },
        localization: { translate: (key: string) => key },
        load: jest.fn(),
      },
    ) as DocumentsComponent;

    component.openAssociations(createDocument());

    expect(component.load).not.toHaveBeenCalled();
    expect(changes.emit).not.toHaveBeenCalled();
  });
});
