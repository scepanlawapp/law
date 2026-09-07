import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FakeChatModelProvider } from "@law/llm";
import { ChatEventBus, ChatRuntimeConfig, ChatService } from "@law/chat";

function prismaMock() {
  return {
    chatSession: {
      findFirst: jest.fn(),
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
  };
}

const now = new Date("2026-09-06T12:00:00.000Z");
const session = {
  id: "session-1",
  workspaceId: "workspace-1",
  createdByUserId: "user-1",
  title: "New chat",
  status: "ACTIVE" as const,
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
      new FakeChatModelProvider({ decision: "NON_LEGAL", reason: "ok" }),
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
      new FakeChatModelProvider({
        decision: "LEGAL",
        reason: "Lawsuit intake",
      }),
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
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
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
      new FakeChatModelProvider({
        decision: "LEGAL",
        reason: "Lawsuit intake",
      }),
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
      new FakeChatModelProvider({
        decision: "NON_LEGAL",
        reason: "Weather",
      }),
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
});
