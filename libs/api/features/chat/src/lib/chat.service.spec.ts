import { BadRequestException, NotFoundException } from "@nestjs/common";
import { FakeChatModelProvider } from "@law/llm";
import { ChatEventBus } from "./chat.events";
import { ChatRuntimeConfig } from "./chat.config";
import { ChatService } from "./chat.service";
import { ChatStorageService } from "./chat.storage";

function prismaMock() {
  return {
    chatSession: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    chatMessage: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    chatAttachment: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn(),
    },
    workflowJob: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };
}

describe("ChatService", () => {
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
    prisma.workflowJob.update.mockImplementation(({ data }) =>
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
      { save: jest.fn(), read: jest.fn() } as ChatStorageService,
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
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(prisma.workflowJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workflowName: "brief-extraction",
          status: "QUEUED",
        }),
      }),
    );
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
        data: expect.objectContaining({ status: "RUNNING" }),
      }),
    );
    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({ status: "COMPLETED" }),
      }),
    );
  });

  it("extracts attachment text and marks the job completed", async () => {
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
    prisma.workflowJob.update.mockImplementation(({ data }) =>
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
      } as ChatStorageService,
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
    await new Promise((resolve) => setTimeout(resolve, 0));

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
});
