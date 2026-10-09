import JSZip from "jszip";
import { createHash } from "node:crypto";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FakeChatModelProvider } from "@law/llm";
import type { ChatStreamEvent } from "@law/api-interfaces";
import {
  ChatEventBus,
  ChatRuntimeConfig,
  ChatService,
  WorkflowQueuePort,
} from "@law/chat";

const fakeBrief = {
  jobType: "lawsuit",
  plaintiff: { name: "Petar Petrović", address: null },
  defendant: { name: "Marko Marković", address: null },
  competentCourt: null,
  claimValue: null,
  legalBasis: [],
  factualDescription: null,
  evidence: [],
  reliefSought: null,
  missingFields: ["competentCourt"],
  confidence: 0.6,
  warnings: [],
};

function prismaMock() {
  const workflowJobs = new Map<string, Record<string, unknown>>();
  const briefExtractionResults = new Map<string, Record<string, unknown>>();
  let jobSeq = 0;
  let briefSeq = 0;
  let messageSeq = 0;

  const prisma = {
    chatSession: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "session-created",
          status: "ACTIVE",
          isDeleted: false,
          createdAt: now,
          updatedAt: now,
          title: "New chat",
          ...data,
        }),
      ),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    case: {
      findFirst: jest.fn().mockResolvedValue(null),
    },
    chatMessage: {
      create: jest.fn(
        async ({
          data,
        }: {
          data: Record<string, unknown>;
        }): Promise<Record<string, unknown>> => {
          messageSeq += 1;
          return {
            id: `message-${messageSeq}`,
            triageDecision: null,
            metadata: null,
            createdAt: now,
            ...data,
          };
        },
      ),
      update: jest.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }): Promise<Record<string, unknown>> => ({
          id: where.id,
          sessionId: session.id,
          role: "ASSISTANT",
          content: "",
          status: "PENDING",
          triageDecision: null,
          correlationId: "corr-answer",
          metadata: { outcome: "ANSWER" },
          createdAt: now,
          ...data,
        }),
      ),
      findUnique: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    chatAttachment: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    workflowJob: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        jobSeq += 1;
        const record = {
          id: `job-${jobSeq}`,
          createdAt: now,
          updatedAt: now,
          errorCode: null,
          output: null,
          ...data,
        };
        workflowJobs.set(record.id, record);
        return Promise.resolve(record);
      }),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const existing = workflowJobs.get(where.id) ?? {
            id: where.id,
            createdAt: now,
          };
          const updated = { ...existing, ...data, updatedAt: now };
          workflowJobs.set(where.id, updated);
          return Promise.resolve(updated);
        },
      ),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(workflowJobs.get(where.id) ?? null),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    briefExtractionResult: {
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        briefSeq += 1;
        const record = { id: `brief-result-${briefSeq}`, ...data };
        briefExtractionResults.set(record.id, record);
        return Promise.resolve(record);
      }),
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(briefExtractionResults.get(where.id) ?? null),
      ),
      findFirst: jest.fn().mockResolvedValue(null),
    },
    draftResult: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    agentToolCall: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    pendingAction: {
      findMany: jest.fn().mockResolvedValue([]),
    },
    documentAnalysis: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
    },
    auditEvent: {
      create: jest.fn(),
    },
  };
  return prisma;
}

const now = new Date("2026-09-06T12:00:00.000Z");
const session = {
  id: "session-1",
  workspaceId: "workspace-1",
  createdByUserId: "user-1",
  title: "New chat",
  status: "ACTIVE" as const,
  isDeleted: false,
  createdAt: now,
  updatedAt: now,
};

describe("ChatService", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns 404 for sessions outside the workspace", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(null);
    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream(session.id).subscribe((event) => emitted.push(event));
    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ decision: "LEGAL", reason: "ok" }),
    );

    await expect(
      service.getSession("workspace-1", "session-2"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("accepts Excel workbook attachments", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create.mockResolvedValue({
      id: "msg-user",
      sessionId: session.id,
      role: "USER",
      content: "Tužba",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-1",
      createdAt: now,
    });
    prisma.chatAttachment.create.mockResolvedValue({
      id: "attachment-1",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      messageId: "msg-user",
      originalName: "budget.xlsx",
      storedName: "budget.xlsx",
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 128,
      createdAt: now,
    });

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { decision: "NON_LEGAL", reason: "ok" },
        { title: "Tužba" },
      ]),
    );

    await expect(
      service.sendMessage({
        workspaceId: "workspace-1",
        sessionId: "session-1",
        userId: "user-1",
        content: "Tužba",
        files: [
          {
            originalname: "budget.xlsx",
            mimetype:
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            size: 128,
            buffer: Buffer.from("xlsx"),
          },
        ],
      }),
    ).resolves.toMatchObject({
      userMessage: { attachments: [{ originalName: "budget.xlsx" }] },
    });
  });

  describe("attachment content", () => {
    const pdf = Buffer.from("%PDF-1.4 ugovor");
    const sha256 = createHash("sha256").update(pdf).digest("hex");

    function uploadSetup() {
      const prisma = prismaMock();
      prisma.chatSession.findFirst.mockImplementation(
        async ({ where }: { where: { id: string } }) => ({
          ...session,
          id: where.id,
        }),
      );
      prisma.chatSession.update.mockResolvedValue(session);
      prisma.chatMessage.create.mockResolvedValue({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "Ugovor",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-1",
        createdAt: now,
      });
      prisma.chatAttachment.create.mockImplementation(
        async ({ data }: { data: Record<string, unknown> }) => ({
          createdAt: now,
          content: { status: "PENDING" },
          ...data,
        }),
      );
      const content = {
        findOrCreate: jest.fn(async () => ({
          id: "content-1",
          status: "PENDING",
          pipelineVersion: 1,
        })),
        // Never rejects: queue outages are swallowed inside the helper.
        requestIngestionSafely: jest.fn().mockResolvedValue(undefined),
      };
      const service = new ChatService(
        prisma as never,
        new ChatEventBus(),
        { save: jest.fn(async () => "stored"), read: jest.fn() } as never,
        new ChatRuntimeConfig(),
        new FakeChatModelProvider([
          { decision: "NON_LEGAL", reason: "ok" },
          { title: "Ugovor" },
        ]),
        undefined,
        undefined,
        undefined,
        content as never,
      );
      const send = (sessionId: string) =>
        service.sendMessage({
          workspaceId: "workspace-1",
          sessionId,
          userId: "user-1",
          content: "Ugovor",
          files: [
            {
              originalname: "ugovor.pdf",
              mimetype: "application/pdf",
              size: pdf.length,
              buffer: pdf,
            },
          ],
        });
      return { prisma, content, send };
    }

    it("hashes the upload and shares one content row across sessions", async () => {
      const { prisma, content, send } = uploadSetup();

      const first = await send("session-1");
      const second = await send("session-2");

      expect(content.findOrCreate).toHaveBeenCalledTimes(2);
      expect(content.findOrCreate).toHaveBeenCalledWith({
        workspaceId: "workspace-1",
        sha256,
        mimeType: "application/pdf",
        sizeBytes: pdf.length,
      });
      const created = prisma.chatAttachment.create.mock.calls.map(
        ([args]: [{ data: Record<string, unknown> }]) => args.data,
      );
      expect(created).toHaveLength(2);
      expect(created[0]).toMatchObject({ sha256, contentId: "content-1" });
      expect(created[1]).toMatchObject({ sha256, contentId: "content-1" });
      expect(created[0].sessionId).not.toBe(created[1].sessionId);
      expect(content.requestIngestionSafely).toHaveBeenCalledWith(
        "workspace-1",
        ["content-1"],
      );
      expect(first.userMessage.attachments[0]).toMatchObject({
        aiStatus: "QUEUED",
      });
      expect(second.userMessage.attachments).toHaveLength(1);
    });

    it("requests ingestion once per saved attachment", async () => {
      const { content, send } = uploadSetup();

      await expect(send("session-1")).resolves.toMatchObject({
        userMessage: { attachments: [{ originalName: "ugovor.pdf" }] },
      });
      expect(content.requestIngestionSafely).toHaveBeenCalledTimes(1);
    });
  });

  it("rejects unsupported attachment types", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ decision: "LEGAL", reason: "ok" }),
    );

    await expect(
      service.sendMessage({
        workspaceId: "workspace-1",
        sessionId: "session-1",
        userId: "user-1",
        content: "tužba",
        files: [
          {
            originalname: "note.exe",
            mimetype: "application/x-msdownload",
            size: 10,
            buffer: Buffer.from("x"),
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("does not queue a job for non-legal messages", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "What's the weather?",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-1",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "rejected",
        status: "COMPLETED",
        triageDecision: "NON_LEGAL",
        correlationId: "corr-1",
        createdAt: now,
      });

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Vreme" },
        { decision: "NON_LEGAL", reason: "Weather" },
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "What's the weather?",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.workflowJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.workflowJob.create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workflowName: "brief-extraction" }),
      }),
    );
  });

  it("sendMessage runs Portir and queues one agent turn for a legal request", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Tužba" },
        {
          decision: "LEGAL",
          reason: "Lawsuit",
          intent: "DRAFT",
          language: "sr",
        },
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "Pripremi tužbu za naplatu duga.",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    const created = prisma.workflowJob.create.mock.calls.map(
      ([arg]) => arg.data.workflowName,
    );
    expect(created).toEqual(["triage", "agent-turn"]);
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowName: "agent-turn",
        input: expect.objectContaining({
          messageId: "message-1",
          intent: "DRAFT",
        }),
      }),
    });
  });

  it("getDraft returns the persisted draft for a job in the workspace", async () => {
    const prisma = prismaMock();
    prisma.draftResult.findFirst.mockResolvedValue({
      id: "draft-1",
      jobId: "job-5-draft",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      messageId: "msg-assistant",
      briefResultId: "brief-result-5",
      documentText: "TUŽBA...",
      warnings: [],
      promptChars: 42,
      truncated: false,
      model: "openai/gpt-4o-mini",
      errorCode: null,
      createdAt: now,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.getDraft(session.workspaceId, "job-5-draft"),
    ).resolves.toMatchObject({
      id: "draft-1",
      documentText: "TUŽBA...",
      script: "latin",
    });
    await expect(
      service.getDraft(session.workspaceId, "job-5-draft", "cyrillic"),
    ).resolves.toMatchObject({ documentText: "ТУЖБА...", script: "cyrillic" });
  });

  it("getDraft throws NotFoundException when no draft exists", async () => {
    const prisma = prismaMock();
    prisma.draftResult.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.getDraft(session.workspaceId, "job-unknown"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("exports a contract review memo and records the audit event", async () => {
    const prisma = prismaMock();
    prisma.documentAnalysis.findFirst.mockResolvedValue({
      id: "analysis-1",
      sessionId: session.id,
      caseId: null,
      kind: "CONTRACT_REVIEW",
      documentRef: "att:nda",
      documentTitle: "NDA Alfa",
      contractType: "NDA",
      clientSide: "Beta d.o.o.",
      result: {
        summary: "Kratak sažetak.",
        keyTerms: [],
        issues: [
          {
            title: "Neograničeno trajanje",
            category: "RISK",
            risk: "HIGH",
            clause: "Član 6",
            quote: null,
            explanation: "Obaveza traje neograničeno.",
            suggestion: "Ograničiti na 3 godine.",
            citations: [],
          },
        ],
        missingClauses: [],
        warnings: [],
      },
      citations: [],
      truncated: false,
      model: "test-model",
      createdAt: now,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    const result = await service.exportAnalysis(
      session.workspaceId,
      "analysis-1",
      "user-1",
      "latin",
    );

    expect(result.filename).toBe(
      "analiza-ugovor-o-poverljivosti-session1-2026-09-06.docx",
    );
    const zip = await JSZip.loadAsync(result.buffer);
    const xml = await zip.file("word/document.xml")?.async("string");
    expect(xml).toContain("Neograničeno trajanje");
    expect(xml).toContain("Klijent kancelarije: Beta d.o.o.");
    expect(prisma.documentAnalysis.findFirst).toHaveBeenCalledWith({
      where: { id: "analysis-1", workspaceId: session.workspaceId },
    });
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventType: "analysis.exported",
        metadata: expect.objectContaining({ analysisId: "analysis-1" }),
      }),
    });
  });

  it("does not export a case timeline", async () => {
    const prisma = prismaMock();
    prisma.documentAnalysis.findFirst.mockResolvedValue({
      id: "analysis-2",
      sessionId: session.id,
      kind: "CASE_TIMELINE",
      createdAt: now,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.exportAnalysis(session.workspaceId, "analysis-2", "user-1"),
    ).rejects.toThrow("Only contract reviews can be exported");
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });

  it("rejects exporting an analysis from another workspace", async () => {
    const prisma = prismaMock();
    prisma.documentAnalysis.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.exportAnalysis("other-workspace", "analysis-1", "user-1"),
    ).rejects.toThrow("Analysis not found");
  });

  it("names the export after the draft's document type", async () => {
    const prisma = prismaMock();
    prisma.draftResult.findFirst.mockResolvedValue({
      id: "draft-2",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      documentType: "MEDIA_REPLY_REQUEST",
      documentText: "Zahtev",
      finalDocumentText: null,
      createdAt: now,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    const result = await service.exportDraft(
      session.workspaceId,
      "draft-2",
      "user-1",
      "latin",
    );

    expect(result.filename).toBe(
      "zahtev-za-objavljivanje-odgovora-session1-2026-09-06.docx",
    );
  });

  it("exports the final draft text and records the export audit event", async () => {
    const prisma = prismaMock();
    prisma.draftResult.findFirst.mockResolvedValue({
      id: "draft-1",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      documentText: "Pogrešan tekst",
      finalDocumentText: "Tužilac: Petar Petrović",
      createdAt: now,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    const result = await service.exportDraft(
      session.workspaceId,
      "draft-1",
      "user-1",
      "cyrillic",
    );

    expect(result.filename).toBe("tuzba-session1-2026-09-06.docx");
    expect(result.buffer.subarray(0, 2).toString()).toBe("PK");
    expect(prisma.auditEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: session.workspaceId,
        userId: "user-1",
        eventType: "draft.exported",
        metadata: expect.objectContaining({
          draftId: "draft-1",
          format: "docx",
          script: "cyrillic",
        }),
      }),
    });
  });

  it("approves a draft and records reviewer metadata", async () => {
    const prisma = prismaMock();
    prisma.draftResult.findUnique.mockResolvedValue({
      id: "draft-1",
      jobId: "job-5-draft",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      messageId: "msg-assistant",
      briefResultId: "brief-result-5",
      documentText: "TUŽBA...",
      warnings: [],
      promptChars: 42,
      truncated: false,
      model: "openai/gpt-4o-mini",
      errorCode: null,
      approvalStatus: "READY_FOR_SIGNOFF",
      finalDocumentText: null,
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      previousDraftId: null,
      createdAt: now,
      updatedAt: now,
    });
    prisma.draftResult.update.mockResolvedValue({
      id: "draft-1",
      jobId: "job-5-draft",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      messageId: "msg-assistant",
      briefResultId: "brief-result-5",
      documentText: "TUŽBA...",
      warnings: [],
      promptChars: 42,
      truncated: false,
      model: "openai/gpt-4o-mini",
      errorCode: null,
      approvalStatus: "APPROVED",
      finalDocumentText: "TUŽBA...",
      reviewedByUserId: "user-2",
      reviewedAt: now,
      reviewNote: "Sve je u redu.",
      previousDraftId: null,
      createdAt: now,
      updatedAt: now,
    });

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.approveDraft(
        session.workspaceId,
        "draft-1",
        "user-2",
        "Sve je u redu.",
      ),
    ).resolves.toMatchObject({
      id: "draft-1",
      approvalStatus: "APPROVED",
      reviewedByUserId: "user-2",
      reviewNote: "Sve je u redu.",
    });
    expect(prisma.draftResult.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "draft-1" },
        data: expect.objectContaining({
          approvalStatus: "APPROVED",
          reviewedByUserId: "user-2",
          reviewNote: "Sve je u redu.",
          reviewedAt: expect.any(Date),
        }),
      }),
    );
  });

  it("requests changes by enqueueing a drafting revision with reviewer feedback", async () => {
    const prisma = prismaMock();
    const draft = {
      id: "draft-2",
      jobId: "job-5-draft",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      messageId: "msg-assistant",
      briefResultId: "brief-result-5",
      documentText: "TUŽBA...",
      warnings: [],
      promptChars: 42,
      truncated: false,
      model: "openai/gpt-4o-mini",
      approvalStatus: "READY_FOR_SIGNOFF" as const,
      finalDocumentText: "TUŽBA...",
      reviewedByUserId: null,
      reviewedAt: null,
      reviewNote: null,
      previousDraftId: null,
      createdAt: now,
      updatedAt: now,
      briefResult: { missingFields: [] },
    };
    prisma.draftResult.findUnique.mockResolvedValue(draft);
    prisma.draftResult.update.mockResolvedValue({
      ...draft,
      approvalStatus: "CHANGES_REQUESTED",
      reviewNote: "Dodati obrazloženje.",
    });
    prisma.workflowJob.findUnique.mockResolvedValue({
      id: draft.jobId,
      correlationId: "corr-draft",
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue } as WorkflowQueuePort,
    );

    await expect(
      service.requestChangesDraft(
        session.workspaceId,
        draft.id,
        "user-2",
        "Dodati obrazloženje.",
      ),
    ).resolves.toMatchObject({ approvalStatus: "CHANGES_REQUESTED" });

    expect(prisma.workflowJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowName: "drafting",
          input: expect.objectContaining({
            briefResultId: draft.briefResultId,
            previousDraftId: draft.id,
            reviewerNote: "Dodati obrazloženje.",
          }),
        }),
      }),
    );
    expect(enqueue).toHaveBeenCalledWith(
      "drafting",
      expect.any(String),
      expect.objectContaining({ sessionId: session.id }),
    );
  });

  it("auto-generates a session title from the first message and emits it", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...session, ...data }),
    );
    prisma.chatMessage.create.mockResolvedValue({
      id: "msg-title",
      sessionId: session.id,
      role: "USER",
      content: "Tužba za naknadu štete",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-title",
      createdAt: now,
    });

    const events = new ChatEventBus();
    const emitted: Array<{ type: string; title?: string | null }> = [];
    events.stream(session.id).subscribe((event) => emitted.push(event));

    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Tužba za naknadu štete" },
        { decision: "NON_LEGAL", reason: "ok" },
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "Tužba za naknadu štete",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: expect.objectContaining({ title: "Tužba za naknadu štete" }),
      }),
    );
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.title.updated",
          title: "Tužba za naknadu štete",
        }),
      ]),
    );
  });

  it("keeps the text of an attachment filed as an AI-off document out of the title prompt", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...session, ...data }),
    );
    prisma.chatAttachment.findMany.mockResolvedValue([
      {
        originalName: "tajni.pdf",
        mimeType: "application/pdf",
        extractedText: "POVERLJIV SADRŽAJ",
        documentId: "doc-1",
        document: { aiAccess: false, archivedAt: null },
      },
      {
        originalName: "javni.pdf",
        mimeType: "application/pdf",
        extractedText: "JAVNI SADRŽAJ",
        documentId: null,
        document: null,
      },
    ]);
    const provider = new FakeChatModelProvider([{ title: "Naslov" }]);
    const completeStructured = jest.spyOn(provider, "completeStructured");
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      provider,
    );

    await (
      service as unknown as {
        runTitleGeneration(params: unknown): Promise<void>;
      }
    ).runTitleGeneration({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      content: "Pogledaj priloge",
      attachmentIds: ["a-1", "a-2"],
    });

    const prompt = JSON.stringify(completeStructured.mock.calls[0][0]);
    expect(prompt).not.toContain("POVERLJIV");
    expect(prompt).toContain("JAVNI SADRŽAJ");
    expect(prisma.chatAttachment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId: session.workspaceId,
        }),
      }),
    );
  });

  it("does not auto-generate a title when the session already has one", async () => {
    const customSession = { ...session, title: "Prvi predmet" };
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(customSession);
    prisma.chatSession.update.mockResolvedValue(customSession);
    prisma.chatMessage.create.mockResolvedValue({
      id: "msg-no-title",
      sessionId: customSession.id,
      role: "USER",
      content: "Tužba za naknadu štete",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-no-title",
      createdAt: now,
    });

    const events = new ChatEventBus();
    const emitted: string[] = [];
    events
      .stream(customSession.id)
      .subscribe((event) => emitted.push(event.type));

    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ decision: "NON_LEGAL", reason: "ok" }),
    );

    await service.sendMessage({
      workspaceId: customSession.workspaceId,
      sessionId: customSession.id,
      userId: "user-1",
      content: "Tužba za naknadu štete",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(emitted).not.toContain("session.title.updated");
    expect(prisma.chatSession.update).toHaveBeenCalledTimes(1);
  });

  it("falls back to truncated message text when title generation fails", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...session, ...data }),
    );
    prisma.chatMessage.create.mockResolvedValue({
      id: "msg-fallback",
      sessionId: session.id,
      role: "USER",
      content: "Tužba za naknadu štete zbog prelaska na crveno svetlo",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-fallback",
      createdAt: now,
    });

    let calls = 0;
    const provider = {
      completeStructured: jest.fn().mockImplementation(async () => {
        calls += 1;
        if (calls === 1) throw new Error("LLM down");
        return { decision: "NON_LEGAL", reason: "ok" };
      }),
    };

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      provider as never,
    );

    await expect(
      service.sendMessage({
        workspaceId: session.workspaceId,
        sessionId: session.id,
        userId: "user-1",
        content: "Tužba za naknadu štete zbog prelaska na crveno svetlo",
        files: [],
      }),
    ).resolves.toMatchObject({
      userMessage: {
        content: "Tužba za naknadu štete zbog prelaska na crveno svetlo",
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: expect.objectContaining({
          title: "Tužba za naknadu štete zbog prelaska na crveno svetlo",
        }),
      }),
    );
  });

  it("updateSession updates the title and emits session.title.updated", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue({
      ...session,
      title: "Ručni naziv",
    });

    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream(session.id).subscribe((event) => emitted.push(event));

    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.updateSession(session.workspaceId, session.id, {
        title: "  Ručni naziv  ",
      }),
    ).resolves.toMatchObject({ title: "Ručni naziv" });

    expect(prisma.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: expect.objectContaining({ title: "Ručni naziv" }),
      }),
    );
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.title.updated",
          title: "Ručni naziv",
        }),
      ]),
    );
  });

  it("updateSession throws NotFoundException for sessions outside the workspace", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.updateSession("workspace-1", "session-2", {
        title: "Ručni naziv",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("listSessions excludes soft-deleted sessions", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findMany.mockResolvedValue([session]);
    prisma.chatSession.count.mockResolvedValue(1);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.listSessions(session.workspaceId, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [expect.objectContaining({ id: session.id, isDeleted: false })],
    });
    expect(prisma.chatSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
    expect(prisma.chatSession.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
  });

  it("includes persisted workflow activity in session summaries", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findMany.mockResolvedValue([session]);
    prisma.chatSession.count.mockResolvedValue(1);
    prisma.workflowJob.findMany.mockResolvedValue([
      {
        id: "job-active",
        workspaceId: session.workspaceId,
        sessionId: session.id,
        workflowName: "brief-extraction",
        status: "RUNNING",
        correlationId: "corr-active",
        output: { progressStage: "EXTRACTING_FACTS" },
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    prisma.draftResult.findMany.mockResolvedValue([{ sessionId: session.id }]);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.listSessions(session.workspaceId, { page: 1, pageSize: 20 }),
    ).resolves.toMatchObject({
      items: [
        {
          id: session.id,
          activity: {
            activeJobCount: 1,
            hasDraft: true,
            latestJob: {
              id: "job-active",
              progressStage: "EXTRACTING_FACTS",
              updatedAt: now.toISOString(),
            },
          },
        },
      ],
    });
  });

  describe("conversation organizer", () => {
    const newService = (prisma: ReturnType<typeof prismaMock>) =>
      new ChatService(
        prisma as never,
        new ChatEventBus(),
        { save: jest.fn(), read: jest.fn() } as never,
        new ChatRuntimeConfig(),
        new FakeChatModelProvider({}),
      );
    const caseId = "11111111-1111-4111-8111-111111111111";
    const clientId = "22222222-2222-4222-8222-222222222222";

    it("listSessions applies scope, state, matter and author filters in the workspace", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findMany.mockResolvedValue([]);
      prisma.chatSession.count.mockResolvedValue(0);

      await newService(prisma).listSessions(
        session.workspaceId,
        {
          page: 1,
          pageSize: 20,
          scope: "mine",
          states: ["pending", "draft"],
          caseIds: [caseId],
          clientIds: [clientId],
          authorIds: ["user-2"],
          analysisKinds: ["CONTRACT_REVIEW"],
        },
        "user-1",
      );

      const where = prisma.chatSession.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        workspaceId: session.workspaceId,
        isDeleted: false,
        status: "ACTIVE",
        createdByUserId: "user-1",
      });
      expect(where.AND).toEqual(
        expect.arrayContaining([
          {
            OR: [
              { pendingActions: { some: { status: "PENDING" } } },
              {
                workflowJobs: {
                  some: { status: { in: ["QUEUED", "RUNNING"] } },
                },
              },
            ],
          },
          { draftResults: { some: {} } },
          {
            documentAnalyses: {
              some: { kind: { in: ["CONTRACT_REVIEW"] } },
            },
          },
          { caseId: { in: [caseId] } },
          { case: { clientId: { in: [clientId] } } },
          { createdByUserId: { in: ["user-2"] } },
        ]),
      );
      expect(prisma.chatSession.count).toHaveBeenCalledWith({ where });
    });

    it("listSessions team scope does not restrict the author", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findMany.mockResolvedValue([]);
      prisma.chatSession.count.mockResolvedValue(0);

      await newService(prisma).listSessions(
        session.workspaceId,
        { page: 1, pageSize: 20, scope: "team" },
        "user-1",
      );

      const where = prisma.chatSession.findMany.mock.calls[0][0].where;
      expect(where).not.toHaveProperty("createdByUserId");
      expect(where).not.toHaveProperty("AND");
    });

    it("listSessions searches title, matter and messages in Latin script", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findMany.mockResolvedValue([]);
      prisma.chatSession.count.mockResolvedValue(0);

      await newService(prisma).listSessions(session.workspaceId, {
        page: 1,
        pageSize: 20,
        search: " Петровић ",
      });

      const contains = { contains: "Petrović", mode: "insensitive" };
      expect(prisma.chatSession.findMany.mock.calls[0][0].where.AND).toEqual([
        {
          OR: [
            { title: contains },
            { case: { caseNumber: contains } },
            { case: { name: contains } },
            { case: { client: { displayName: contains } } },
            { messages: { some: { content: contains } } },
          ],
        },
      ]);
    });

    it("listSessions lists archived conversations and keeps pinned ones first", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findMany.mockResolvedValue([]);
      prisma.chatSession.count.mockResolvedValue(0);

      await newService(prisma).listSessions(session.workspaceId, {
        page: 1,
        pageSize: 20,
        archived: true,
        group: "matter",
      });

      const call = prisma.chatSession.findMany.mock.calls[0][0];
      expect(call.where.status).toBe("ARCHIVED");
      expect(call.orderBy.slice(0, 3)).toEqual([
        { pinnedAt: { sort: "desc", nulls: "last" } },
        { case: { client: { displayName: "asc" } } },
        { case: { caseNumber: "asc" } },
      ]);
    });

    it("listSessions reports pending proposals and analysis kinds", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findMany.mockResolvedValue([
        { ...session, pinnedAt: now },
      ]);
      prisma.chatSession.count.mockResolvedValue(1);
      prisma.pendingAction.findMany.mockResolvedValue([
        { sessionId: session.id },
        { sessionId: session.id },
      ]);
      prisma.documentAnalysis.findMany.mockResolvedValue([
        { sessionId: session.id, kind: "CONTRACT_REVIEW" },
      ]);

      await expect(
        newService(prisma).listSessions(session.workspaceId, {
          page: 1,
          pageSize: 20,
        }),
      ).resolves.toMatchObject({
        items: [
          {
            pinnedAt: now.toISOString(),
            activity: {
              pendingActionCount: 2,
              analysisKinds: ["CONTRACT_REVIEW"],
            },
          },
        ],
      });
    });

    it("sessionFacets counts states and suggests matters and authors", async () => {
      const prisma = prismaMock() as ReturnType<typeof prismaMock> & {
        client: { findMany: jest.Mock };
        user: { findMany: jest.Mock };
      };
      prisma.chatSession.count
        .mockResolvedValueOnce(2)
        .mockResolvedValueOnce(3)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(4);
      (prisma.case as unknown as { findMany: jest.Mock }).findMany = jest
        .fn()
        .mockResolvedValue([
          {
            id: caseId,
            caseNumber: "P-12/2026",
            name: "Petrović protiv Jovanovića",
            clientId,
            client: { displayName: "Petrović" },
          },
        ]);
      prisma.client = {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: clientId, displayName: "Petrović" }]),
      };
      prisma.user = {
        findMany: jest.fn().mockResolvedValue([
          { id: "user-1", firstName: "Ana", lastName: "Ilić", email: "a@x.rs" },
          { id: "user-2", firstName: null, lastName: null, email: "b@x.rs" },
        ]),
      };

      await expect(
        newService(prisma).sessionFacets(
          session.workspaceId,
          { scope: "mine", search: "Петр" },
          "user-1",
        ),
      ).resolves.toEqual({
        counts: { pending: 2, draft: 3, analysis: 1, archived: 4 },
        suggestions: {
          clients: [{ id: clientId, displayName: "Petrović" }],
          cases: [
            {
              id: caseId,
              caseNumber: "P-12/2026",
              name: "Petrović protiv Jovanovića",
              clientId,
              clientDisplayName: "Petrović",
            },
          ],
          authors: [
            { id: "user-1", displayName: "Ana Ilić" },
            { id: "user-2", displayName: "b@x.rs" },
          ],
        },
      });
      const scoped = {
        workspaceId: session.workspaceId,
        isDeleted: false,
        createdByUserId: "user-1",
      };
      expect(prisma.chatSession.count).toHaveBeenLastCalledWith({
        where: { ...scoped, status: "ARCHIVED" },
      });
      expect(prisma.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId: session.workspaceId,
            cases: { some: { chatSessions: { some: scoped } } },
            displayName: { contains: "Petr", mode: "insensitive" },
          },
        }),
      );
    });

    it("updateSession pins and archives without touching the title", async () => {
      const prisma = prismaMock();
      prisma.chatSession.findFirst.mockResolvedValue(session);
      prisma.chatSession.update.mockResolvedValue({
        ...session,
        status: "ARCHIVED",
        pinnedAt: now,
      });

      await expect(
        newService(prisma).updateSession(session.workspaceId, session.id, {
          pinned: true,
          archived: true,
        }),
      ).resolves.toMatchObject({
        status: "ARCHIVED",
        pinnedAt: now.toISOString(),
      });
      const data = prisma.chatSession.update.mock.calls[0][0].data;
      expect(data).toEqual({ pinnedAt: expect.any(Date), status: "ARCHIVED" });

      await newService(prisma).updateSession(session.workspaceId, session.id, {
        pinned: false,
        archived: false,
      });
      expect(prisma.chatSession.update.mock.calls[1][0].data).toEqual({
        pinnedAt: null,
        status: "ACTIVE",
      });
    });
  });

  it("shows an attachment as OFF once it was filed as a document the assistant may not read", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    const attachment = (
      id: string,
      document: { aiAccess: boolean; archivedAt: Date | null } | null,
    ) => ({
      id,
      originalName: `${id}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 10,
      createdAt: new Date("2026-10-01T10:00:00.000Z"),
      extractionStatus: "COMPLETED",
      sourceScript: null,
      content: { status: "READY" },
      document,
    });
    prisma.chatMessage.findMany.mockResolvedValue([
      {
        id: "message-1",
        sessionId: session.id,
        role: "USER",
        content: "Prilozi",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: null,
        metadata: null,
        createdAt: new Date("2026-10-01T10:00:00.000Z"),
        attachments: [
          attachment("unfiled", null),
          attachment("filed-on", { aiAccess: true, archivedAt: null }),
          attachment("filed-off", { aiAccess: false, archivedAt: null }),
          attachment("filed-archived", {
            aiAccess: true,
            archivedAt: new Date("2026-10-02T10:00:00.000Z"),
          }),
        ],
      },
    ]);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    const detail = await service.getSession(session.workspaceId, session.id);

    expect(
      detail.messages[0].attachments.map((item) => [item.id, item.aiStatus]),
    ).toEqual([
      ["unfiled", "READY"],
      ["filed-on", "READY"],
      ["filed-off", "OFF"],
      ["filed-archived", "OFF"],
    ]);
    expect(prisma.chatMessage.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          attachments: {
            include: expect.objectContaining({
              document: { select: { aiAccess: true, archivedAt: true } },
            }),
          },
        },
      }),
    );
  });

  it("returns authoritative messages, jobs, and drafts for a session", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findMany.mockResolvedValue([]);
    prisma.workflowJob.findMany.mockResolvedValue([
      {
        id: "job-1",
        workspaceId: session.workspaceId,
        sessionId: session.id,
        workflowName: "triage",
        status: "COMPLETED",
        correlationId: "corr-1",
        output: { progressStage: "UNDERSTANDING_REQUEST" },
        errorCode: null,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    prisma.draftResult.findMany.mockResolvedValue([]);
    prisma.agentToolCall.findMany.mockResolvedValue([
      {
        id: "tool-1",
        jobId: "job-2",
        toolName: "search_legal_sources",
        status: "COMPLETED",
        input: { query: "Zakon o radu otkaz" },
        output: { count: 3, sources: "…" },
        durationMs: 420,
        startedAt: now,
        finishedAt: now,
        job: { correlationId: "corr-2" },
      },
    ]);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.getSession(session.workspaceId, session.id),
    ).resolves.toMatchObject({
      id: session.id,
      messages: [],
      jobs: [
        {
          id: "job-1",
          status: "COMPLETED",
          progressStage: "UNDERSTANDING_REQUEST",
        },
      ],
      drafts: [],
      toolCalls: [
        {
          id: "tool-1",
          jobId: "job-2",
          correlationId: "corr-2",
          toolName: "search_legal_sources",
          status: "COMPLETED",
          label: "Zakon o radu otkaz",
          resultCount: 3,
          durationMs: 420,
        },
      ],
    });
    expect(prisma.agentToolCall.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sessionId: session.id, workspaceId: session.workspaceId },
      }),
    );
  });

  it("deleteSession soft-deletes the session and emits session.deleted", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue({
      ...session,
      isDeleted: true,
    });

    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream(session.id).subscribe((event) => emitted.push(event));

    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.deleteSession(session.workspaceId, session.id),
    ).resolves.toMatchObject({ id: session.id, isDeleted: true });

    expect(prisma.chatSession.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: session.id },
        data: expect.objectContaining({ isDeleted: true }),
      }),
    );
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "session.deleted",
          sessionId: session.id,
        }),
      ]),
    );
  });

  it("deleteSession throws NotFoundException for sessions outside the workspace", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.deleteSession("workspace-1", "session-2"),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("treats deleted sessions as not found on getSession", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.getSession(session.workspaceId, session.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chatSession.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isDeleted: false }),
      }),
    );
  });

  it("sendMessage enqueues exactly one triage job onto the injected workflow queue", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create.mockResolvedValue({
      id: "msg-user",
      sessionId: session.id,
      role: "USER",
      content: "Tužba",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-1",
      createdAt: now,
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const workflowQueue: WorkflowQueuePort = { enqueue };

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ title: "Tužba" }),
      workflowQueue,
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "Tužba",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(enqueue).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith(
      "triage",
      expect.any(String),
      expect.objectContaining({
        workspaceId: session.workspaceId,
        sessionId: session.id,
        correlationId: expect.any(String),
      }),
    );
    // The injected queue is a mock, so the runner never actually executes.
    expect(prisma.workflowJob.update).not.toHaveBeenCalled();
  });

  it("retries a failed job with persisted input and the same correlation", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    const sourceInput = {
      userText: "Pravno pitanje",
      attachments: [],
      language: "sr",
      messageId: "msg-user",
    };
    const failed = await prisma.workflowJob.create({
      data: {
        workspaceId: session.workspaceId,
        sessionId: session.id,
        workflowName: "answering",
        status: "FAILED",
        correlationId: "corr-retry",
        input: sourceInput,
      },
    });
    prisma.workflowJob.create.mockClear();
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue },
    );

    await expect(
      service.retryJob(session.workspaceId, failed.id),
    ).resolves.toMatchObject({
      workflowName: "answering",
      status: "QUEUED",
      correlationId: "corr-retry",
    });
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        input: sourceInput,
        correlationId: "corr-retry",
        status: "QUEUED",
      }),
    });
    expect(enqueue).toHaveBeenCalledWith(
      "answering",
      expect.any(String),
      expect.objectContaining({
        correlationId: "corr-retry",
        messageId: "msg-user",
      }),
    );
  });

  it("rejects retry while the correlation has active work", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    const failed = await prisma.workflowJob.create({
      data: {
        workspaceId: session.workspaceId,
        sessionId: session.id,
        workflowName: "drafting",
        status: "FAILED",
        correlationId: "corr-active",
        input: {},
      },
    });
    prisma.workflowJob.findFirst.mockResolvedValue({ id: "job-running" });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue: jest.fn() },
    );

    await expect(
      service.retryJob(session.workspaceId, failed.id),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("persists assistant feedback without replacing message metadata", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    const assistant = {
      id: "message-feedback",
      sessionId: session.id,
      role: "ASSISTANT",
      content: "Odgovor",
      status: "COMPLETED",
      triageDecision: null,
      correlationId: "corr-feedback",
      metadata: { outcome: "ANSWER" },
      createdAt: now,
    };
    prisma.chatMessage.findUnique.mockResolvedValue(assistant);
    prisma.chatMessage.update.mockResolvedValue({
      ...assistant,
      metadata: { outcome: "ANSWER", feedback: "POSITIVE" },
      attachments: [],
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.updateMessageFeedback(
        session.workspaceId,
        assistant.id,
        "POSITIVE",
      ),
    ).resolves.toMatchObject({ feedback: "POSITIVE" });
    expect(prisma.chatMessage.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          metadata: { outcome: "ANSWER", feedback: "POSITIVE" },
        },
      }),
    );
  });

  it("rejects feedback on a user message", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: "message-user",
      sessionId: session.id,
      role: "USER",
      metadata: null,
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.updateMessageFeedback(
        session.workspaceId,
        "message-user",
        "NEGATIVE",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("regenerates a completed streamed answer from persisted input", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: "message-answer",
      sessionId: session.id,
      role: "ASSISTANT",
      status: "COMPLETED",
      correlationId: "corr-answer",
      metadata: { outcome: "ANSWER" },
    });
    const sourceInput = {
      userText: "Pravno pitanje",
      attachments: [],
      language: "sr",
    };
    prisma.workflowJob.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ workflowName: "answering", input: sourceInput });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue },
    );

    await expect(
      service.regenerateAnswer(session.workspaceId, "message-answer"),
    ).resolves.toMatchObject({
      workflowName: "answering",
      status: "QUEUED",
      correlationId: "corr-answer",
    });
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ input: sourceInput }),
    });
    expect(enqueue).toHaveBeenCalledWith(
      "answering",
      expect.any(String),
      expect.objectContaining({ correlationId: "corr-answer" }),
    );
  });

  it("regenerates an agent-turn answer with the same workflow", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: "message-answer",
      sessionId: session.id,
      role: "ASSISTANT",
      status: "COMPLETED",
      correlationId: "corr-answer",
      metadata: { outcome: "ANSWER" },
    });
    const sourceInput = {
      messageId: "message-user",
      userText: "Pravno pitanje",
      attachments: [],
      language: "sr",
    };
    prisma.workflowJob.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        workflowName: "agent-turn",
        input: sourceInput,
      });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue },
    );

    await expect(
      service.regenerateAnswer(session.workspaceId, "message-answer"),
    ).resolves.toMatchObject({ workflowName: "agent-turn" });
    expect(prisma.workflowJob.findFirst).toHaveBeenNthCalledWith(1, {
      where: expect.objectContaining({
        workflowName: { in: ["answering", "agent-turn", "agent-resume"] },
      }),
    });
    expect(enqueue).toHaveBeenCalledWith(
      "agent-turn",
      expect.any(String),
      expect.objectContaining({ correlationId: "corr-answer" }),
    );
  });

  it("refuses to regenerate an answer that proposed actions", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: "message-answer",
      sessionId: session.id,
      role: "ASSISTANT",
      status: "COMPLETED",
      correlationId: "corr-answer",
      metadata: { outcome: "ANSWER", pendingActionIds: ["action-1"] },
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue: jest.fn() },
    );

    await expect(
      service.regenerateAnswer(session.workspaceId, "message-answer"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.workflowJob.create).not.toHaveBeenCalled();
  });

  it("rejects regeneration for a non-answer assistant message", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatMessage.findUnique.mockResolvedValue({
      id: "message-draft",
      sessionId: session.id,
      role: "ASSISTANT",
      status: "COMPLETED",
      correlationId: "corr-draft",
      metadata: { outcome: "DRAFT_READY" },
    });
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
    );

    await expect(
      service.regenerateAnswer(session.workspaceId, "message-draft"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
