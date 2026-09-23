import { DocumentsComponent } from "./documents.component";

describe("DocumentsComponent state helpers", () => {
  const createDocument = (overrides: Partial<any> = {}) => ({
    id: "doc-1",
    title: "Complaint",
    category: null,
    archived: false,
    archivedAt: null,
    caseIds: ["case-1"],
    clientIds: ["client-1"],
    currentVersion: null,
    createdByUserId: "user-1",
    updatedByUserId: "user-1",
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt: "2026-09-15T10:00:00.000Z",
    ...overrides,
  });

  it("treats unlinked documents as needs linking", () => {
    const component = new DocumentsComponent();
    const linked = createDocument();
    const unlinked = createDocument({ caseIds: [], clientIds: [] });

    expect(component.isNeedsLinking(linked)).toBe(false);
    expect(component.isNeedsLinking(unlinked)).toBe(true);
  });

  it("computes summary cards from current document set", () => {
    const component = new DocumentsComponent();
    const docs = [
      createDocument({ archived: false, caseIds: [], clientIds: [] }),
      createDocument({ id: "doc-2", archived: false, caseIds: ["case-2"] }),
      createDocument({ id: "doc-3", archived: true }),
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
