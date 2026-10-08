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
    contentStatus?: string;
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
            ...(options.contentStatus
              ? { content: { status: options.contentStatus } }
              : {}),
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

  it.each([
    ["READY", "READY"],
    ["FAILED", "FAILED"],
    ["UNSUPPORTED", "UNSUPPORTED"],
    ["PENDING", "PENDING"],
    ["EXTRACTING", "PENDING"],
    ["EMBEDDING", "PENDING"],
    ["CLASSIFYING", "PENDING"],
  ])(
    "derives textStatus from content status %s (not the legacy column)",
    async (contentStatus, expected) => {
      const { service } = setup({ contentStatus });

      const result = await service.listDocuments(scope);

      expect(result.status).toBe("OK");
      if (result.status === "OK") {
        // The legacy extractionStatus column says PENDING; the content wins.
        expect(result.items[0]).toMatchObject({
          ref: "doc:doc-1",
          textStatus: expected,
        });
      }
    },
  );

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

    expect(off).toEqual({
      status: "AI_ACCESS_OFF",
      message: AI_ACCESS_OFF_MESSAGE("Ugovor o zakupu"),
    });
    expect(on).toMatchObject({ status: "OK", text: LEASE });
    expect(documentText.ensureText).toHaveBeenCalledTimes(1);
    expect(documentText.ensureText).toHaveBeenCalledWith(
      "workspace-1",
      "content-1",
    );
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

describe("AssistantDocumentReadsService semantic search and facts", () => {
  function doc(
    id: string,
    title: string,
    contentId: string | null,
    aiAccess = true,
  ) {
    return {
      id,
      title,
      createdAt: new Date("2026-09-20T10:00:00Z"),
      aiAccess,
      archivedAt: null,
      currentVersion: {
        id: `version-${id}`,
        originalFilename: `${id}.pdf`,
        extractionStatus: "COMPLETED",
        contentId,
      },
    };
  }

  type Fact = {
    contentId: string;
    subjectKey: string;
    subjectType: "PERSON" | "COMPANY" | "DECISION";
    subjectRole: string | null;
    field: string;
    value: string;
    normalizedValue: string | null;
    quote: string;
    charStart: number | null;
    confidence: number;
  };

  function fact(
    contentId: string,
    field: string,
    value: string,
    extra: Partial<Fact> = {},
  ): Fact {
    return {
      contentId,
      subjectKey: "holder",
      subjectType: "PERSON",
      subjectRole: null,
      field,
      value,
      normalizedValue: null,
      quote: `${field}: ${value}`,
      charStart: 0,
      confidence: 0.9,
      ...extra,
    };
  }

  function setupSemantic(
    options: {
      documents?: ReturnType<typeof doc>[];
      attachments?: unknown[];
      contents?: Array<{
        id: string;
        status: string;
        documentKind: string | null;
      }>;
      chunks?: unknown[];
      facts?: Fact[];
      searchError?: Error;
      withSearch?: boolean;
    } = {},
  ) {
    const documents = options.documents ?? [
      doc("doc-1", "Ugovor o zakupu", "content-1"),
    ];
    const prisma = {
      chatSession: {
        findFirst: jest.fn(async () => ({
          case: { id: "case-1", caseNumber: "P-1/2026" },
        })),
      },
      document: {
        findMany: jest.fn(async () => documents),
        findFirst: jest.fn(async (): Promise<unknown> => null),
      },
      chatAttachment: {
        findMany: jest.fn(async () => options.attachments ?? []),
      },
      documentContent: {
        findMany: jest.fn(async () => options.contents ?? []),
      },
    };
    const search = {
      searchChunks: jest.fn(async () => {
        if (options.searchError) throw options.searchError;
        return options.chunks ?? [];
      }),
      factsFor: jest.fn(async () => options.facts ?? []),
    };
    const service = new AssistantDocumentReadsService(
      prisma as never,
      { read: jest.fn() } as never,
      { ensureText: jest.fn() } as never,
      (options.withSearch === false ? undefined : search) as never,
    );
    return { service, prisma, search };
  }

  const ready = (id: string, documentKind: string | null = null) => ({
    id,
    status: "READY",
    documentKind,
  });

  describe("searchCaseDocuments", () => {
    it("searches only the content of readable, ready sources and numbers hits in order", async () => {
      const { service, search, prisma } = setupSemantic({
        documents: [
          doc("doc-1", "Ugovor o zakupu", "content-1"),
          doc("doc-2", "Tajni ugovor", "content-2", false),
          doc("doc-3", "Aneks", "content-3"),
        ],
        contents: [ready("content-1"), ready("content-2"), ready("content-3")],
        chunks: [
          {
            contentId: "content-3",
            ordinal: 0,
            text: "Aneks menja zakupninu.",
            charStart: 0,
            charEnd: 22,
            score: 0.9,
          },
          {
            contentId: "content-1",
            ordinal: 4,
            text: "Zakupnina iznosi 500 evra.",
            charStart: 100,
            charEnd: 126,
            score: 0.8,
          },
        ],
      });

      const result = await service.searchCaseDocuments(scope, {
        query: "zakupnina",
      });

      expect(search.searchChunks).toHaveBeenCalledWith(
        "workspace-1",
        ["content-1", "content-3"],
        "zakupnina",
        8,
      );
      expect(prisma.documentContent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: "workspace-1",
            id: { in: ["content-1", "content-3"] },
          },
        }),
      );
      expect(result).toEqual({
        status: "OK",
        query: "zakupnina",
        hits: [
          {
            n: 1,
            ref: "doc:doc-3",
            title: "Aneks",
            text: "Aneks menja zakupninu.",
            charStart: 0,
            charEnd: 22,
            score: 0.9,
          },
          {
            n: 2,
            ref: "doc:doc-1",
            title: "Ugovor o zakupu",
            text: "Zakupnina iznosi 500 evra.",
            charStart: 100,
            charEnd: 126,
            score: 0.8,
          },
        ],
        notIndexed: [],
        aiAccessOff: ["Tajni ugovor"],
      });
    });

    it("clamps the limit to 12 and defaults it to 8", async () => {
      const { service, search } = setupSemantic({
        contents: [ready("content-1")],
      });

      await service.searchCaseDocuments(scope, { query: "x1", limit: 99 });
      await service.searchCaseDocuments(scope, { query: "x1", limit: 3 });

      expect(search.searchChunks).toHaveBeenNthCalledWith(
        1,
        "workspace-1",
        ["content-1"],
        "x1",
        12,
      );
      expect(search.searchChunks).toHaveBeenNthCalledWith(
        2,
        "workspace-1",
        ["content-1"],
        "x1",
        3,
      );
    });

    it("lists sources whose content is not ready or missing as not indexed", async () => {
      const { service, search } = setupSemantic({
        documents: [
          doc("doc-1", "Ugovor o zakupu", "content-1"),
          doc("doc-3", "Aneks", "content-3"),
          doc("doc-4", "Stari dokument", null),
        ],
        contents: [
          ready("content-1"),
          { id: "content-3", status: "PROCESSING", documentKind: null },
        ],
        attachments: [
          {
            id: "att-2",
            originalName: "punomoćje.pdf",
            extractionStatus: "PENDING",
            documentId: null,
            contentId: null,
            document: null,
            createdAt: new Date("2026-09-21T09:00:00Z"),
          },
        ],
      });

      const result = await service.searchCaseDocuments(scope, {
        query: "zakup",
      });

      expect(search.searchChunks).toHaveBeenCalledWith(
        "workspace-1",
        ["content-1"],
        "zakup",
        8,
      );
      expect(result).toMatchObject({
        status: "OK",
        hits: [],
        notIndexed: ["Aneks", "Stari dokument", "punomoćje.pdf"],
        aiAccessOff: [],
      });
    });

    it("never queries when nothing readable is indexed", async () => {
      const { service, search } = setupSemantic({
        documents: [doc("doc-2", "Tajni ugovor", "content-2", false)],
        contents: [ready("content-2")],
      });

      const result = await service.searchCaseDocuments(scope, {
        query: "zakup",
      });

      expect(search.searchChunks).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        status: "OK",
        hits: [],
        aiAccessOff: ["Tajni ugovor"],
      });
    });

    it("limits the search to one ref", async () => {
      const { service, search } = setupSemantic({
        documents: [
          doc("doc-1", "Ugovor o zakupu", "content-1"),
          doc("doc-3", "Aneks", "content-3"),
        ],
        contents: [ready("content-1"), ready("content-3")],
      });

      await service.searchCaseDocuments(scope, {
        query: "zakup",
        ref: "doc:doc-3",
      });

      expect(search.searchChunks).toHaveBeenCalledWith(
        "workspace-1",
        ["content-3"],
        "zakup",
        8,
      );
    });

    it("refuses a ref whose AI access is off without searching", async () => {
      const { service, search } = setupSemantic({
        documents: [doc("doc-2", "Tajni ugovor", "content-2", false)],
        contents: [ready("content-2")],
      });

      const result = await service.searchCaseDocuments(scope, {
        query: "zakup",
        ref: "doc:doc-2",
      });

      expect(result).toEqual({
        status: "AI_ACCESS_OFF",
        message: AI_ACCESS_OFF_MESSAGE("Tajni ugovor"),
      });
      expect(search.searchChunks).not.toHaveBeenCalled();
    });

    it("reports an unknown ref and a conversation without documents", async () => {
      const { service, search } = setupSemantic({ documents: [] });

      const unknown = await service.searchCaseDocuments(scope, {
        query: "zakup",
        ref: "doc:nope",
      });
      const none = await service.searchCaseDocuments(scope, { query: "zakup" });

      expect(unknown.status).toBe("NOT_FOUND");
      expect(none.status).toBe("NO_DOCUMENTS");
      expect(search.searchChunks).not.toHaveBeenCalled();
    });

    it("reports unavailable when the search is not wired or fails", async () => {
      const unwired = setupSemantic({ withSearch: false });
      const failing = setupSemantic({
        contents: [ready("content-1")],
        searchError: new Error("embedding down"),
      });

      expect(
        (await unwired.service.searchCaseDocuments(scope, { query: "zakup" }))
          .status,
      ).toBe("UNAVAILABLE");
      expect(
        (await failing.service.searchCaseDocuments(scope, { query: "zakup" }))
          .status,
      ).toBe("UNAVAILABLE");
    });
  });

  describe("getDocumentFacts", () => {
    const PERSON_DOC = (id: string, title: string, contentId: string) =>
      doc(id, title, contentId);

    it("groups facts by subject and passes only readable content ids", async () => {
      const { service, search } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          doc("doc-2", "Tajna kartica", "content-2", false),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-2", "ID_CARD"),
        ],
        facts: [
          fact("content-1", "fullName", "Petar Petrović"),
          fact("content-1", "jmbg", "0101990710006"),
          fact("content-1", "fullName", "Marko Marković", {
            subjectKey: "rep1",
            subjectRole: "zastupnik",
          }),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      expect(search.factsFor).toHaveBeenCalledWith("workspace-1", [
        "content-1",
      ]);
      expect(result).toEqual({
        status: "OK",
        subjects: [
          {
            ref: "doc:doc-1",
            title: "Lična karta",
            documentKind: "ID_CARD",
            subjectKey: "holder",
            subjectType: "PERSON",
            subjectRole: null,
            facts: [
              {
                field: "fullName",
                value: "Petar Petrović",
                quote: "fullName: Petar Petrović",
                confidence: 0.9,
              },
              {
                field: "jmbg",
                value: "0101990710006",
                quote: "jmbg: 0101990710006",
                confidence: 0.9,
              },
            ],
          },
          {
            ref: "doc:doc-1",
            title: "Lična karta",
            documentKind: "ID_CARD",
            subjectKey: "rep1",
            subjectType: "PERSON",
            subjectRole: "zastupnik",
            facts: [
              {
                field: "fullName",
                value: "Marko Marković",
                quote: "fullName: Marko Marković",
                confidence: 0.9,
              },
            ],
          },
        ],
        conflicts: [],
        notIndexed: [],
        aiAccessOff: ["Tajna kartica"],
      });
    });

    it("never returns quotes of a document with AI access off", async () => {
      const { service, search } = setupSemantic({
        documents: [doc("doc-2", "Tajna kartica", "content-2", false)],
        contents: [ready("content-2", "ID_CARD")],
        facts: [
          fact("content-2", "jmbg", "0101990710006", { quote: "TAJNI-CITAT" }),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      expect(search.factsFor).not.toHaveBeenCalled();
      expect(JSON.stringify(result)).not.toContain("TAJNI-CITAT");
      expect(JSON.stringify(result)).not.toContain("0101990710006");
      expect(result).toMatchObject({
        status: "OK",
        subjects: [],
        aiAccessOff: ["Tajna kartica"],
      });
    });

    it("refuses a ref whose AI access is off", async () => {
      const { service, search } = setupSemantic({
        documents: [doc("doc-2", "Tajna kartica", "content-2", false)],
        contents: [ready("content-2")],
      });

      const result = await service.getDocumentFacts(scope, {
        ref: "doc:doc-2",
      });

      expect(result).toEqual({
        status: "AI_ACCESS_OFF",
        message: AI_ACCESS_OFF_MESSAGE("Tajna kartica"),
      });
      expect(search.factsFor).not.toHaveBeenCalled();
    });

    it("lists contents that are not ready as not indexed", async () => {
      const { service, search } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          { id: "content-3", status: "FAILED", documentKind: null },
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      expect(search.factsFor).toHaveBeenCalledWith("workspace-1", [
        "content-1",
      ]);
      expect(result).toMatchObject({ status: "OK", notIndexed: ["Pasoš"] });
    });

    it("reports one conflict when the same person has different JMBGs in two documents", async () => {
      const { service } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-3", "PASSPORT"),
        ],
        facts: [
          fact("content-1", "fullName", "Petar Petrović"),
          fact("content-1", "jmbg", "0101990710006"),
          fact("content-1", "address", "Knez Mihailova 1"),
          fact("content-3", "fullName", "PETAR PETROVIĆ"),
          fact("content-3", "jmbg", "0101990710007"),
          fact("content-3", "address", "knez mihailova 1"),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      if (result.status !== "OK") throw new Error("expected OK");
      expect(result.conflicts).toEqual([
        {
          field: "jmbg",
          subject: "Petar Petrović",
          values: [
            { value: "0101990710006", ref: "doc:doc-1" },
            { value: "0101990710007", ref: "doc:doc-3" },
          ],
        },
      ]);
    });

    it("matches people by JMBG and compares the normalized value", async () => {
      const { service } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-3", "PASSPORT"),
        ],
        facts: [
          fact("content-1", "jmbg", "0101990710006"),
          fact("content-1", "dateOfBirth", "1. januar 1990", {
            normalizedValue: "1990-01-01",
          }),
          fact("content-3", "jmbg", "0101990710006"),
          fact("content-3", "dateOfBirth", "01.01.1990.", {
            normalizedValue: "1990-01-01",
          }),
          fact("content-3", "placeOfBirth", "Niš"),
          fact("content-1", "placeOfBirth", "Beograd"),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      if (result.status !== "OK") throw new Error("expected OK");
      expect(result.conflicts.map((conflict) => conflict.field)).toEqual([
        "placeOfBirth",
      ]);
    });

    it("does not report document-specific fields or addresses as conflicts", async () => {
      const { service } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-3", "PASSPORT"),
        ],
        facts: [
          fact("content-1", "jmbg", "0101990710006"),
          fact("content-1", "documentNumber", "001234567"),
          fact("content-1", "issuedDate", "2020-01-01"),
          fact("content-1", "expiryDate", "2030-01-01"),
          fact("content-1", "issuingAuthority", "PU Beograd"),
          fact("content-1", "address", "Knez Mihailova 1"),
          fact("content-3", "jmbg", "0101990710006"),
          fact("content-3", "documentNumber", "987654321"),
          fact("content-3", "issuedDate", "2024-05-05"),
          fact("content-3", "expiryDate", "2034-05-05"),
          fact("content-3", "issuingAuthority", "PU Niš"),
          fact("content-3", "address", "Bulevar 5"),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      if (result.status !== "OK") throw new Error("expected OK");
      expect(result.conflicts).toEqual([]);
    });

    it("does not report values that differ only inside one document", async () => {
      const { service } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-3", "PASSPORT"),
        ],
        facts: [
          fact("content-1", "fullName", "Petar Petrović"),
          fact("content-1", "placeOfBirth", "Niš"),
          fact("content-1", "fullName", "Petar Petrović", {
            subjectKey: "rep1",
          }),
          fact("content-1", "placeOfBirth", "Beograd", { subjectKey: "rep1" }),
          fact("content-3", "fullName", "Petar Petrović"),
          fact("content-3", "nationality", "srpsko"),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      if (result.status !== "OK") throw new Error("expected OK");
      expect(result.conflicts).toEqual([]);
    });

    it("attributes content shared with an off document to the readable one only", async () => {
      const { service, search } = setupSemantic({
        documents: [
          doc("doc-a", "Kopija A", "content-1", false),
          doc("doc-b", "Original B", "content-1"),
        ],
        contents: [ready("content-1", "ID_CARD")],
        facts: [fact("content-1", "jmbg", "0101990710006")],
        chunks: [
          {
            contentId: "content-1",
            ordinal: 0,
            text: "Zakupnina iznosi 500 evra.",
            charStart: 0,
            charEnd: 26,
            score: 0.9,
          },
        ],
      });

      const found = await service.searchCaseDocuments(scope, {
        query: "zakup",
      });
      const facts = await service.getDocumentFacts(scope, {});

      expect(search.searchChunks).toHaveBeenCalledWith(
        "workspace-1",
        ["content-1"],
        "zakup",
        8,
      );
      expect(found).toMatchObject({
        status: "OK",
        hits: [{ n: 1, ref: "doc:doc-b", title: "Original B" }],
        aiAccessOff: ["Kopija A"],
      });
      expect(facts).toMatchObject({
        status: "OK",
        subjects: [{ ref: "doc:doc-b", title: "Original B" }],
        aiAccessOff: ["Kopija A"],
      });
      expect(JSON.stringify([found, facts])).not.toContain("doc:doc-a");
      const withoutOffList = [found, facts].map((result) => ({
        ...result,
        aiAccessOff: undefined,
      }));
      expect(JSON.stringify(withoutOffList)).not.toContain("Kopija A");
    });

    it("does not treat different people or different subject types as conflicting", async () => {
      const { service } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [
          ready("content-1", "ID_CARD"),
          ready("content-3", "APR_EXCERPT"),
        ],
        facts: [
          fact("content-1", "fullName", "Petar Petrović"),
          fact("content-1", "address", "Knez Mihailova 1"),
          fact("content-3", "fullName", "Petar Petrović", {
            subjectType: "COMPANY",
          }),
          fact("content-3", "address", "Bulevar 5", { subjectType: "COMPANY" }),
          fact("content-3", "fullName", "Jovan Jovanović", {
            subjectKey: "rep1",
          }),
          fact("content-3", "address", "Druga 2", { subjectKey: "rep1" }),
        ],
      });

      const result = await service.getDocumentFacts(scope, {});

      if (result.status !== "OK") throw new Error("expected OK");
      expect(result.conflicts).toEqual([]);
    });

    describe("briefDocumentFacts", () => {
      it("flattens readable facts for the brief without quotes and never loads off documents", async () => {
        const { service, search } = setupSemantic({
          documents: [
            PERSON_DOC("doc-1", "Lična karta", "content-1"),
            doc("doc-2", "Tajna kartica", "content-2", false),
          ],
          contents: [
            ready("content-1", "ID_CARD"),
            ready("content-2", "ID_CARD"),
          ],
          facts: [
            fact("content-1", "fullName", "Petar Petrović", {
              quote: "CITAT-JAVNI",
            }),
            fact("content-1", "caseNumber", "P 12/2026", {
              subjectKey: "decision",
              subjectType: "DECISION",
            }),
            fact("content-2", "jmbg", "9999999999999", {
              quote: "TAJNI-CITAT",
            }),
          ],
        });

        const facts = await service.briefDocumentFacts(scope, []);

        expect(search.factsFor).toHaveBeenCalledWith("workspace-1", [
          "content-1",
        ]);
        expect(facts).toEqual([
          {
            ref: "doc:doc-1",
            title: "Lična karta",
            subjectType: "PERSON",
            subjectRole: null,
            field: "fullName",
            value: "Petar Petrović",
          },
          {
            ref: "doc:doc-1",
            title: "Lična karta",
            subjectType: "DECISION",
            subjectRole: null,
            field: "caseNumber",
            value: "P 12/2026",
          },
        ]);
        const serialized = JSON.stringify(facts);
        expect(serialized).not.toContain("9999999999999");
        expect(serialized).not.toContain("TAJNI-CITAT");
        expect(serialized).not.toContain("CITAT-JAVNI");
      });

      it("returns no facts when a named ref is off, and does not repeat a ref already in the case", async () => {
        const { service, search } = setupSemantic({
          documents: [
            PERSON_DOC("doc-1", "Lična karta", "content-1"),
            doc("doc-2", "Tajna kartica", "content-2", false),
          ],
          contents: [
            ready("content-1", "ID_CARD"),
            ready("content-2", "ID_CARD"),
          ],
          facts: [fact("content-1", "fullName", "Petar Petrović")],
        });

        const facts = await service.briefDocumentFacts(scope, [
          "doc:doc-2",
          "doc:doc-1",
        ]);

        expect(facts).toHaveLength(1);
        for (const call of search.factsFor.mock.calls as unknown[][]) {
          expect(call[1]).not.toContain("content-2");
        }
      });

      it("returns no facts when search is not wired", async () => {
        const { service } = setupSemantic({ withSearch: false });

        await expect(service.briefDocumentFacts(scope, [])).resolves.toEqual(
          [],
        );
      });
    });

    it("limits facts to one ref and reports unknown refs and unwired search", async () => {
      const { service, search } = setupSemantic({
        documents: [
          PERSON_DOC("doc-1", "Lična karta", "content-1"),
          PERSON_DOC("doc-3", "Pasoš", "content-3"),
        ],
        contents: [ready("content-1"), ready("content-3")],
      });
      const unwired = setupSemantic({ withSearch: false });

      await service.getDocumentFacts(scope, { ref: "doc:doc-3" });
      const unknown = await service.getDocumentFacts(scope, {
        ref: "doc:nope",
      });

      expect(search.factsFor).toHaveBeenCalledWith("workspace-1", [
        "content-3",
      ]);
      expect(unknown.status).toBe("NOT_FOUND");
      expect((await unwired.service.getDocumentFacts(scope, {})).status).toBe(
        "UNAVAILABLE",
      );
    });
  });
});
