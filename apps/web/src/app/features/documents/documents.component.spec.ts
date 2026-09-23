import { DocumentsComponent } from "./documents.component";

describe("DocumentsComponent state helpers", () => {
  const createComponent = () =>
    Object.create(DocumentsComponent.prototype) as DocumentsComponent;

  const createDocument = (overrides: Partial<any> = {}) => ({
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

  it("computes summary cards from current document set", () => {
    const component = createComponent();
    const docs = [
      createDocument({ archived: false, cases: [], clients: [] }),
      createDocument({ id: "doc-2", archived: false }),
      createDocument({
        id: "doc-3",
        archived: true,
        createdAt: "2026-08-20T08:00:00.000Z",
      }),
      createDocument({ id: "doc-4", createdAt: "2026-09-20T08:00:00.000Z" }),
    ];

    expect(component.computeSummaryStats(docs)).toEqual({
      active: 3,
      addedThisMonth: 3,
      needsLinking: 1,
      archived: 1,
    });
  });
});
