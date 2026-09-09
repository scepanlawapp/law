import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FakeChatModelProvider } from "@law/llm";
import type { ChatStreamEvent } from "@law/api-interfaces";
import { ChatEventBus, ChatRuntimeConfig, ChatService } from "@law/chat";

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
  return {
    chatSession: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      create: jest.fn(),
    },
    chatAttachment: {
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    workflowJob: {
      create: jest.fn(),
      update: jest.fn(),
    },
    briefExtractionResult: {
      create: jest.fn().mockResolvedValue({ id: "brief-result-1" }),
    },
    draftResult: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };
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
  it("returns 404 for sessions outside the workspace", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(null);
    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
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

  it("queues brief extraction after a legal classification", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "Tužba za naknadu štete",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-1",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-1",
        createdAt: now,
      });
    prisma.workflowJob.create.mockResolvedValue({
      id: "job-1",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      workflowName: "brief-extraction",
      status: "QUEUED",
      correlationId: "corr-1",
      createdAt: now,
      updatedAt: now,
    });
    prisma.workflowJob.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "job-1",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName: "brief-extraction",
          correlationId: "corr-1",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );

    const events = new ChatEventBus();
    const emitted: string[] = [];
    events.stream(session.id).subscribe((event) => emitted.push(event.type));

    const service = new ChatService(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Tužba za naknadu štete" },
        { decision: "LEGAL", reason: "Lawsuit intake" },
        fakeBrief,
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

    expect(prisma.workflowJob.create).toHaveBeenCalled();
    expect(emitted).toEqual(
      expect.arrayContaining([
        "message.created",
        "triage.started",
        "triage.completed",
        "job.queued",
        "job.updated",
      ]),
    );
    expect(prisma.briefExtractionResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-1",
          messageId: "msg-assistant",
          confidence: fakeBrief.confidence,
          missingFields: fakeBrief.missingFields,
        }),
      }),
    );
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "COMPLETED",
          output: expect.objectContaining({ brief: fakeBrief }),
        }),
      }),
    );
  });

  it("extracts attachment text and stores it on the attachment", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "(attachment)",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-2",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-2",
        createdAt: now,
      });
    prisma.chatAttachment.create.mockResolvedValue({
      id: "att-1",
      originalName: "note.txt",
      mimeType: "text/plain",
      sizeBytes: 5,
      createdAt: now,
    });
    prisma.chatAttachment.findMany.mockResolvedValue([
      {
        id: "att-1",
        workspaceId: session.workspaceId,
        sessionId: session.id,
        storedName: "att-1",
        originalName: "note.txt",
        mimeType: "text/plain",
      },
    ]);
    prisma.workflowJob.create.mockResolvedValue({
      id: "job-2",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      workflowName: "brief-extraction",
      status: "QUEUED",
      correlationId: "corr-2",
      createdAt: now,
      updatedAt: now,
    });
    prisma.workflowJob.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "job-2",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName: "brief-extraction",
          correlationId: "corr-2",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      {
        save: jest.fn(),
        read: jest.fn().mockResolvedValue(Buffer.from("hello world")),
      } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { decision: "LEGAL", reason: "Lawsuit intake" },
        { title: "Poruka sa prilogom" },
        fakeBrief,
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "",
      files: [
        {
          originalname: "note.txt",
          mimetype: "text/plain",
          size: 5,
          buffer: Buffer.from("hello"),
        },
      ],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.chatAttachment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({
          extractionStatus: "COMPLETED",
          extractedText: "hello world",
        }),
      }),
    );
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-2" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
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

    expect(prisma.workflowJob.create).not.toHaveBeenCalled();
  });

  it("records a brief error without losing raw texts when the LLM throws", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "Tužba za naknadu štete",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-3",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-3",
        createdAt: now,
      });
    prisma.workflowJob.create.mockResolvedValue({
      id: "job-3",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      workflowName: "brief-extraction",
      status: "QUEUED",
      correlationId: "corr-3",
      createdAt: now,
      updatedAt: now,
    });
    prisma.workflowJob.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "job-3",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName: "brief-extraction",
          correlationId: "corr-3",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );

    let calls = 0;
    const provider = {
      completeStructured: jest.fn().mockImplementation(async () => {
        calls += 1;
        if (calls <= 2) return { decision: "LEGAL", reason: "Lawsuit" };
        throw new Error("OpenRouter timed out");
      }),
    };

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      provider as never,
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "Tužba za naknadu štete",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.briefExtractionResult.create).not.toHaveBeenCalled();
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-3" },
        data: expect.objectContaining({
          status: "COMPLETED",
          errorCode: "BRIEF_LLM_FAILED",
          output: expect.objectContaining({
            userText: "Tužba za naknadu štete",
            briefError: "OpenRouter timed out",
          }),
        }),
      }),
    );
  });

  it("skips the LLM call and records an empty outcome when there is no context", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "(attachment)",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-4",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-4",
        createdAt: now,
      });
    prisma.chatAttachment.create.mockResolvedValue({
      id: "att-2",
      originalName: "scan.png",
      mimeType: "image/png",
      sizeBytes: 5,
      createdAt: now,
    });
    prisma.chatAttachment.findMany.mockResolvedValue([
      {
        id: "att-2",
        workspaceId: session.workspaceId,
        sessionId: session.id,
        storedName: "att-2",
        originalName: "scan.png",
        mimeType: "image/png",
      },
    ]);
    prisma.workflowJob.create.mockResolvedValue({
      id: "job-4",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      workflowName: "brief-extraction",
      status: "QUEUED",
      correlationId: "corr-4",
      createdAt: now,
      updatedAt: now,
    });
    prisma.workflowJob.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "job-4",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName: "brief-extraction",
          correlationId: "corr-4",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      {
        save: jest.fn(),
        read: jest.fn().mockRejectedValue(new Error("file missing")),
      } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { decision: "LEGAL", reason: "Lawsuit" },
        { title: "Poruka" },
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "",
      files: [
        {
          originalname: "scan.png",
          mimetype: "image/png",
          size: 5,
          buffer: Buffer.from("hello"),
        },
      ],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.briefExtractionResult.create).not.toHaveBeenCalled();
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-4" },
        data: expect.objectContaining({
          status: "COMPLETED",
          errorCode: null,
          output: expect.objectContaining({
            brief: null,
            briefOutcome: "empty",
          }),
        }),
      }),
    );
  });

  it("auto-chains drafting and persists a DraftResult for a lawsuit brief", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "Tužba za naknadu štete",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-5",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-5",
        createdAt: now,
      });
    prisma.briefExtractionResult.create.mockResolvedValue({
      id: "brief-result-5",
    });
    prisma.workflowJob.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: data["workflowName"] === "drafting" ? "job-5-draft" : "job-5",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          correlationId: "corr-5",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );
    prisma.workflowJob.update.mockImplementation(
      ({
        where,
        data,
      }: {
        where: { id: string };
        data: Record<string, unknown>;
      }) =>
        Promise.resolve({
          id: where.id,
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName:
            where.id === "job-5-draft" ? "drafting" : "brief-extraction",
          correlationId: "corr-5",
          createdAt: now,
          updatedAt: now,
          status: "RUNNING",
          errorCode: null,
          ...data,
        }),
    );

    const fakeDraft = {
      documentText: "PRVI OSNOVNI SUD U BEOGRADU\n\nTUŽBA...",
      warnings: [],
    };

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Tužba za naknadu štete" },
        { decision: "LEGAL", reason: "Lawsuit intake" },
        fakeBrief,
        fakeDraft,
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

    expect(prisma.workflowJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workflowName: "drafting" }),
      }),
    );
    expect(prisma.draftResult.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobId: "job-5-draft",
          briefResultId: "brief-result-5",
          documentText: fakeDraft.documentText,
          warnings: fakeDraft.warnings,
        }),
      }),
    );
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-5-draft" },
        data: expect.objectContaining({ status: "COMPLETED", errorCode: null }),
      }),
    );
  });

  it("does not queue a drafting job for a non-lawsuit brief", async () => {
    const prisma = prismaMock();
    prisma.chatSession.findFirst.mockResolvedValue(session);
    prisma.chatSession.update.mockResolvedValue(session);
    prisma.chatMessage.create
      .mockResolvedValueOnce({
        id: "msg-user",
        sessionId: session.id,
        role: "USER",
        content: "Treba mi ugovor o zakupu",
        status: "COMPLETED",
        triageDecision: null,
        correlationId: "corr-6",
        createdAt: now,
      })
      .mockResolvedValueOnce({
        id: "msg-assistant",
        sessionId: session.id,
        role: "ASSISTANT",
        content: "accepted",
        status: "COMPLETED",
        triageDecision: "LEGAL",
        correlationId: "corr-6",
        createdAt: now,
      });
    prisma.briefExtractionResult.create.mockResolvedValue({
      id: "brief-result-6",
    });
    prisma.workflowJob.create.mockResolvedValue({
      id: "job-6",
      workspaceId: session.workspaceId,
      sessionId: session.id,
      workflowName: "brief-extraction",
      status: "QUEUED",
      correlationId: "corr-6",
      createdAt: now,
      updatedAt: now,
    });
    prisma.workflowJob.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: "job-6",
          workspaceId: session.workspaceId,
          sessionId: session.id,
          workflowName: "brief-extraction",
          correlationId: "corr-6",
          createdAt: now,
          updatedAt: now,
          ...data,
        }),
    );

    const contractBrief = { ...fakeBrief, jobType: "contract" };

    const service = new ChatService(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider([
        { title: "Ugovor o zakupu" },
        { decision: "LEGAL", reason: "Contract intake" },
        contractBrief,
      ]),
    );

    await service.sendMessage({
      workspaceId: session.workspaceId,
      sessionId: session.id,
      userId: "user-1",
      content: "Treba mi ugovor o zakupu",
      files: [],
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(prisma.workflowJob.create).toHaveBeenCalledTimes(1);
    expect(prisma.draftResult.create).not.toHaveBeenCalled();
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
    events.stream(customSession.id).subscribe((event) =>
      emitted.push(event.type),
    );

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
      userMessage: { content: "Tužba za naknadu štete zbog prelaska na crveno svetlo" },
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
      service.updateSession(session.workspaceId, session.id, "  Ručni naziv  "),
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
      service.updateSession("workspace-1", "session-2", "Ručni naziv"),
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
      expect.objectContaining({ where: expect.objectContaining({ isDeleted: false }) }),
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
});
