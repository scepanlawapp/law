import {
  AI_ACCESS_OFF_MESSAGE,
  AssistantDocumentReadsService,
  fold,
} from "@law/chat";
import type { AssistantTurnScope } from "@law/mastra";

jest.mock("@law/extraction", () => ({
  extractAttachmentText: jest.fn(async () => ({
    status: "COMPLETED",
    text: "Izvučen tekst priloga.",
    sourceScript: "LATIN",
  })),
}));

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-1",
  userDisplayName: "Ana Anić",
};

const LEASE =
  "UGOVOR O ZAKUPU\nZakupodavac Petar Petrović daje u zakup stan.\n" +
  "Mesečna   zakupnina iznosi 500 evra.\n" +
  "Zakupnina se plaća do petog u mesecu.";

function setup(
  options: {
    caseLinked?: boolean;
    aiAccess?: boolean;
    contentId?: string | null;
  } = {},
) {
  const caseLinked = options.caseLinked ?? true;
  const aiAccess = options.aiAccess ?? true;
  const contentId =
    options.contentId === undefined ? "content-1" : options.contentId;
  const prisma = {
    chatSession: {
      findFirst: jest.fn(async () => ({
        case: caseLinked ? { id: "case-1", caseNumber: "P-1/2026" } : null,
      })),
    },
    document: {
      findMany: jest.fn(async () => [
        {
          id: "doc-1",
          title: "Ugovor o zakupu",
          createdAt: new Date("2026-09-20T10:00:00Z"),
          aiAccess,
          archivedAt: null,
          currentVersion: {
            id: "version-1",
            originalFilename: "ugovor.pdf",
            extractionStatus: "PENDING",
            contentId,
          },
        },
      ]),
      findFirst: jest.fn(async (): Promise<unknown> => null),
    },
    documentVersion: {
      findFirst: jest.fn(
        async (): Promise<unknown> => ({
          extractionStatus: "COMPLETED",
          extractedText: LEASE,
        }),
      ),
    },
    chatAttachment: {
      findMany: jest.fn(async () => [
        {
          id: "att-filed",
          originalName: "ugovor.pdf",
          extractionStatus: "COMPLETED",
          documentId: "doc-1",
          contentId: "content-1",
          document: { archivedAt: null, aiAccess },
          createdAt: new Date("2026-09-20T09:00:00Z"),
        },
        {
          id: "att-2",
          originalName: "punomoćje.pdf",
          extractionStatus: "PENDING",
          documentId: null,
          contentId: null,
          document: null,
          createdAt: new Date("2026-09-21T09:00:00Z"),
        },
      ]),
      findFirst: jest.fn(async () => ({
        id: "att-2",
        sessionId: "session-1",
        storedName: "att-2",
        mimeType: "application/pdf",
        extractionStatus: "PENDING",
        extractedText: null,
      })),
      update: jest.fn(async () => ({})),
    },
  };
  const storage = { read: jest.fn(async () => Buffer.from("%PDF")) };
  const documentText = {
    ensureText: jest.fn(async () => ({ status: "COMPLETED", text: LEASE })),
  };
  return {
    prisma,
    storage,
    documentText,
    service: new AssistantDocumentReadsService(
      prisma as never,
      storage as never,
      documentText as never,
    ),
  };
}

describe("AssistantDocumentReadsService", () => {
  it("lists case documents and unfiled chat attachments, workspace-scoped", async () => {
    const { service, prisma } = setup();

    const result = await service.listDocuments(scope);

    expect(result).toEqual({
      status: "OK",
      case: "P-1/2026",
      truncated: false,
      items: [
        {
          ref: "doc:doc-1",
          title: "Ugovor o zakupu",
          fileName: "ugovor.pdf",
          origin: "CASE",
          textStatus: "PENDING",
          aiAccess: "on",
          addedAt: "2026-09-20",
        },
        expect.objectContaining({ ref: "att:att-2", origin: "CHAT" }),
      ],
    });
    expect(prisma.document.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: "workspace-1",
          archivedAt: null,
          cases: { some: { caseId: "case-1" } },
        }),
      }),
    );
    expect(prisma.chatAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1", sessionId: "session-1" },
      }),
    );
  });

  it("lists only chat attachments when the conversation has no case", async () => {
    const { service, prisma } = setup({ caseLinked: false });

    const result = await service.listDocuments(scope);

    expect(prisma.document.findMany).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: "OK", case: null });
    if (result.status === "OK") {
      expect(result.items.map((item) => item.ref)).toEqual([
        "att:att-filed",
        "att:att-2",
      ]);
    }
  });

  it("reads a case document in windows through lazy extraction", async () => {
    const { service, documentText } = setup();

    const first = await service.readDocument(scope, { ref: "doc:doc-1" });
    const tail = await service.readDocument(scope, {
      ref: "doc:doc-1",
      offset: LEASE.length - 10,
    });

    expect(documentText.ensureText).toHaveBeenCalledWith(
      "workspace-1",
      "content-1",
    );
    expect(first).toMatchObject({
      status: "OK",
      offset: 0,
      nextOffset: null,
      totalChars: LEASE.length,
      text: LEASE,
    });
    expect(tail).toMatchObject({ offset: LEASE.length - 10, nextOffset: null });
  });

  it("extracts and stores a pending chat attachment on read", async () => {
    const { service, prisma, storage } = setup();

    const result = await service.readDocument(scope, { ref: "att:att-2" });

    expect(storage.read).toHaveBeenCalledWith({
      workspaceId: "workspace-1",
      sessionId: "session-1",
      storedName: "att-2",
    });
    expect(prisma.chatAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-2" },
        data: expect.objectContaining({ extractionStatus: "COMPLETED" }),
      }),
    );
    expect(result).toMatchObject({
      status: "OK",
      text: "Izvučen tekst priloga.",
    });
  });

  it("does not read another workspace's or an archived document", async () => {
    const { service, prisma, documentText } = setup();

    const result = await service.readDocument(scope, { ref: "doc:other" });

    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "other",
          workspaceId: "workspace-1",
          archivedAt: null,
        }),
      }),
    );
    expect(result.status).toBe("NOT_FOUND");
    expect(documentText.ensureText).not.toHaveBeenCalled();
  });

  it("does not look up refs that are not documents", async () => {
    const { service, prisma } = setup();

    const result = await service.readDocument(scope, { ref: "att:other" });

    expect(result.status).toBe("NOT_FOUND");
    expect(prisma.document.findFirst).not.toHaveBeenCalled();
  });

  it("reads and searches a workspace document named by its ref outside the case", async () => {
    const { service, prisma, documentText } = setup({ caseLinked: false });
    prisma.document.findFirst.mockResolvedValue({
      id: "doc-9",
      title: "Ugovor o zakupu",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      aiAccess: true,
      archivedAt: null,
      currentVersion: {
        id: "version-9",
        originalFilename: "zakup.pdf",
        extractionStatus: "COMPLETED",
        contentId: "content-9",
      },
    });

    const read = await service.readDocument(scope, { ref: "doc:doc-9" });
    const search = await service.searchDocuments(scope, {
      query: "zakupnina",
      ref: "doc:doc-9",
    });

    expect(documentText.ensureText).toHaveBeenCalledWith(
      "workspace-1",
      "content-9",
    );
    expect(read).toMatchObject({ status: "OK", ref: "doc:doc-9", text: LEASE });
    expect(search).toMatchObject({ status: "OK", searched: 1 });
  });

  it("finds phrases regardless of case, script, diacritics, and line breaks", async () => {
    const { service } = setup();

    const result = await service.searchDocuments(scope, {
      query: "МЕСЕЧНА ЗАКУПНИНА",
      ref: "doc:doc-1",
    });

    expect(result).toMatchObject({ status: "OK", searched: 1 });
    if (result.status !== "OK") return;
    expect(result.matches).toHaveLength(1);
    const [match] = result.matches;
    expect(match.count).toBe(1);
    expect(match.hits[0].offset).toBe(LEASE.indexOf("Mesečna"));
    expect(match.hits[0].snippet).toContain("Mesečna zakupnina iznosi 500");

    const loose = await service.searchDocuments(scope, {
      query: "zakupnina",
      ref: "doc:doc-1",
    });
    expect(loose).toMatchObject({ matches: [{ count: 2 }] });
  });

  it("reports documents without readable text", async () => {
    const { service, documentText } = setup();
    documentText.ensureText.mockResolvedValue({
      status: "UNSUPPORTED",
      text: null,
    });

    const result = await service.searchDocuments(scope, {
      query: "zakup",
      ref: "doc:doc-1",
    });

    expect(result).toEqual({
      status: "OK",
      query: "zakup",
      searched: 0,
      unreadable: ["Ugovor o zakupu"],
      aiAccessOff: [],
      matches: [],
    });
  });

  it("returns every source with text for a timeline and skips beyond the limit", async () => {
    const { service, documentText } = setup();

    const result = await service.documentsForTimeline(scope, { limit: 1 });

    expect(result).toEqual({
      caseId: "case-1",
      caseNumber: "P-1/2026",
      documents: [
        {
          ref: "doc:doc-1",
          title: "Ugovor o zakupu",
          status: "COMPLETED",
          text: LEASE,
        },
      ],
      skipped: [{ ref: "att:att-2", title: "punomoćje.pdf" }],
    });
    expect(documentText.ensureText).toHaveBeenCalledWith(
      "workspace-1",
      "content-1",
    );
  });

  it("reports a timeline source without readable text", async () => {
    const { service, documentText } = setup();
    documentText.ensureText.mockResolvedValueOnce({
      status: "UNSUPPORTED",
      text: null,
    } as never);

    const result = await service.documentsForTimeline(scope, { limit: 1 });

    expect(result.documents).toEqual([
      { ref: "doc:doc-1", title: "Ugovor o zakupu", status: "UNSUPPORTED" },
    ]);
  });

  it("limits a timeline to the named refs", async () => {
    const { service } = setup();

    const result = await service.documentsForTimeline(scope, {
      refs: ["doc:doc-1", "doc:unknown"],
      limit: 20,
    });

    expect(result.documents.map((doc) => doc.ref)).toEqual(["doc:doc-1"]);
    expect(result.skipped).toEqual([]);
  });
});

describe("AssistantDocumentReadsService AI access", () => {
  const OFF = AI_ACCESS_OFF_MESSAGE("Ugovor o zakupu");

  it("refuses to read a document with AI access off and never touches its text", async () => {
    const { service, documentText, prisma } = setup({ aiAccess: false });

    const result = await service.readDocument(scope, { ref: "doc:doc-1" });

    expect(result).toEqual({ status: "AI_ACCESS_OFF", message: OFF });
    expect(documentText.ensureText).not.toHaveBeenCalled();
    expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
  });

  it("still lists a document with AI access off, marked off", async () => {
    const { service } = setup({ aiAccess: false });

    const result = await service.listDocuments(scope);

    expect(result).toMatchObject({
      status: "OK",
      items: [
        { ref: "doc:doc-1", aiAccess: "off" },
        { ref: "att:att-2", aiAccess: "on" },
      ],
    });
  });

  it("refuses the off document but reads the on one when both share a content row", async () => {
    const { service, prisma, documentText } = setup({ aiAccess: false });
    prisma.document.findFirst.mockResolvedValue({
      id: "doc-2",
      title: "Kopija ugovora",
      createdAt: new Date("2026-09-22T10:00:00Z"),
      aiAccess: true,
      archivedAt: null,
      currentVersion: {
        id: "version-2",
        originalFilename: "kopija.pdf",
        extractionStatus: "COMPLETED",
        contentId: "content-1",
      },
    });

    const off = await service.readDocument(scope, { ref: "doc:doc-1" });
    const on = await service.readDocument(scope, { ref: "doc:doc-2" });

    expect(off.status).toBe("AI_ACCESS_OFF");
    expect(on).toMatchObject({ status: "OK", text: LEASE });
    expect(documentText.ensureText).toHaveBeenCalledTimes(1);
  });

  it("refuses an explicitly named document with AI access off", async () => {
    const { service, prisma, documentText } = setup({ caseLinked: false });
    prisma.document.findFirst.mockResolvedValue({
      id: "doc-9",
      title: "Tajni ugovor",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      aiAccess: false,
      archivedAt: null,
      currentVersion: {
        id: "version-9",
        originalFilename: "tajni.pdf",
        extractionStatus: "COMPLETED",
        contentId: "content-9",
      },
    });

    const read = await service.readDocument(scope, { ref: "doc:doc-9" });
    const search = await service.searchDocuments(scope, {
      query: "zakup",
      ref: "doc:doc-9",
    });

    expect(read).toEqual({
      status: "AI_ACCESS_OFF",
      message: AI_ACCESS_OFF_MESSAGE("Tajni ugovor"),
    });
    expect(search).toEqual({
      status: "AI_ACCESS_OFF",
      message: AI_ACCESS_OFF_MESSAGE("Tajni ugovor"),
    });
    expect(documentText.ensureText).not.toHaveBeenCalled();
  });

  it("treats an explicitly named archived document as not found", async () => {
    const { service, prisma, documentText } = setup({ caseLinked: false });
    prisma.document.findFirst.mockResolvedValue({
      id: "doc-9",
      title: "Arhivirano",
      createdAt: new Date("2026-09-20T10:00:00Z"),
      aiAccess: true,
      archivedAt: new Date("2026-10-01T00:00:00Z"),
      currentVersion: {
        id: "version-9",
        originalFilename: "a.pdf",
        extractionStatus: "COMPLETED",
        contentId: "content-9",
      },
    });

    const read = await service.readDocument(scope, { ref: "doc:doc-9" });

    expect(read.status).toBe("NOT_FOUND");
    expect(documentText.ensureText).not.toHaveBeenCalled();
  });

  it("refuses an attachment that was filed as a document with AI access off", async () => {
    const { service, documentText, storage } = setup({
      caseLinked: false,
      aiAccess: false,
    });

    const result = await service.readDocument(scope, { ref: "att:att-filed" });

    expect(result).toEqual({
      status: "AI_ACCESS_OFF",
      message: AI_ACCESS_OFF_MESSAGE("ugovor.pdf"),
    });
    expect(documentText.ensureText).not.toHaveBeenCalled();
    expect(storage.read).not.toHaveBeenCalled();
  });

  it("does not search sources with AI access off and lists them as off", async () => {
    const { service, documentText } = setup({ aiAccess: false });

    const result = await service.searchDocuments(scope, { query: "zakupnina" });

    expect(result).toMatchObject({
      status: "OK",
      searched: 1,
      aiAccessOff: ["Ugovor o zakupu"],
      matches: [],
    });
    expect(documentText.ensureText).not.toHaveBeenCalled();
  });

  it("gives drafting, review and timeline no text of an off document", async () => {
    const { service, documentText } = setup({ aiAccess: false });

    const byRef = await service.documentsByRef(scope, ["doc:doc-1"]);
    const timeline = await service.documentsForTimeline(scope, { limit: 5 });
    const named = await service.documentsForTimeline(scope, {
      refs: ["doc:doc-1"],
      limit: 5,
    });

    expect(byRef).toEqual([
      {
        id: "doc:doc-1",
        name: "Ugovor o zakupu",
        mimeType: "ugovor.pdf",
        status: "FAILED",
        note: OFF,
      },
    ]);
    expect(timeline.documents[0]).toEqual({
      ref: "doc:doc-1",
      title: "Ugovor o zakupu",
      status: "FAILED",
      note: OFF,
    });
    expect(named.documents[0]).toMatchObject({
      ref: "doc:doc-1",
      status: "FAILED",
      note: OFF,
    });
    expect(named.documents[0].text).toBeUndefined();
    expect(documentText.ensureText).not.toHaveBeenCalled();
  });

  it("reads a version that has no content row yet from its stored text, after the policy", async () => {
    const { service, documentText, prisma } = setup({ contentId: null });

    const result = await service.readDocument(scope, { ref: "doc:doc-1" });

    expect(result).toMatchObject({ status: "OK", text: LEASE });
    expect(documentText.ensureText).not.toHaveBeenCalled();
    expect(prisma.documentVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "version-1", workspaceId: "workspace-1" },
      }),
    );
  });

  it("does not read the stored text of an off document that has no content row", async () => {
    const { service, prisma } = setup({ contentId: null, aiAccess: false });

    const result = await service.readDocument(scope, { ref: "doc:doc-1" });

    expect(result.status).toBe("AI_ACCESS_OFF");
    expect(prisma.documentVersion.findFirst).not.toHaveBeenCalled();
  });
});

describe("fold", () => {
  it("keeps a map back to the original offsets", () => {
    const folded = fold("Đak  Čačak\nŠid");
    expect(folded.text).toBe("dak cacak sid");
    expect(folded.origin[folded.text.indexOf("sid")]).toBe(11);
  });
});
