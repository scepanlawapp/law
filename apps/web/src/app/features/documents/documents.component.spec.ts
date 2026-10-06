import { DocumentSummary } from "@law/api-interfaces";
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
});
