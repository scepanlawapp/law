import { AssistantDocumentReadsService, fold } from "@law/chat";
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

function setup(options: { caseLinked?: boolean } = {}) {
  const caseLinked = options.caseLinked ?? true;
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
          currentVersion: {
            id: "version-1",
            originalFilename: "ugovor.pdf",
            extractionStatus: "PENDING",
          },
        },
      ]),
    },
    chatAttachment: {
      findMany: jest.fn(async () => [
        {
          id: "att-filed",
          originalName: "ugovor.pdf",
          extractionStatus: "COMPLETED",
          documentId: "doc-1",
          createdAt: new Date("2026-09-20T09:00:00Z"),
        },
        {
          id: "att-2",
          originalName: "punomoćje.pdf",
          extractionStatus: "PENDING",
          documentId: null,
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
      "version-1",
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

  it("does not read documents outside the conversation's scope", async () => {
    const { service, documentText } = setup();

    const result = await service.readDocument(scope, { ref: "doc:other" });

    expect(result.status).toBe("NOT_FOUND");
    expect(documentText.ensureText).not.toHaveBeenCalled();
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
      matches: [],
    });
  });
});

describe("fold", () => {
  it("keeps a map back to the original offsets", () => {
    const folded = fold("Đak  Čačak\nŠid");
    expect(folded.text).toBe("dak cacak sid");
    expect(folded.origin[folded.text.indexOf("sid")]).toBe(11);
  });
});
