import { FakeChatModelProvider } from "@law/llm";
import type { ChatStreamEvent } from "@law/api-interfaces";
import {
  ChatEventBus,
  ChatRuntimeConfig,
  WorkflowJobPayload,
  WorkflowRunner,
} from "@law/chat";

const now = new Date("2026-09-10T12:00:00.000Z");

function prismaMock() {
  const workflowJobs = new Map<string, Record<string, unknown>>();
  return {
    workflowJob: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(workflowJobs.get(where.id) ?? null),
      ),
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
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const record = {
          id: `job-${workflowJobs.size + 1}`,
          createdAt: now,
          updatedAt: now,
          errorCode: null,
          output: null,
          ...data,
        };
        workflowJobs.set(record.id, record);
        return Promise.resolve(record);
      }),
      seed(id: string, record: Record<string, unknown>) {
        workflowJobs.set(id, { id, createdAt: now, updatedAt: now, ...record });
      },
    },
    chatMessage: { create: jest.fn(), update: jest.fn() },
    chatAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    briefExtractionResult: {
      create: jest.fn(),
      findUnique: jest.fn(),
    },
    draftResult: { create: jest.fn() },
  };
}

function payload(jobId: string): WorkflowJobPayload {
  return {
    workspaceId: "workspace-1",
    sessionId: "session-1",
    jobId,
    correlationId: "corr-1",
  };
}

describe("WorkflowRunner", () => {
  it("streams and persists a correlated legal answer", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-answer", {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      status: "QUEUED",
      workflowName: "answering",
      correlationId: "corr-1",
      input: {
        userText: "Koji je opšti rok zastarelosti?",
        attachments: [],
        language: "sr",
      },
    });
    const pendingMessage = {
      id: "message-answer",
      sessionId: "session-1",
      role: "ASSISTANT",
      content: "",
      status: "PENDING",
      triageDecision: null,
      correlationId: "corr-1",
      metadata: { outcome: "ANSWER" },
      createdAt: now,
    };
    prisma.chatMessage.create.mockResolvedValue(pendingMessage);
    prisma.chatMessage.update.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...pendingMessage, ...data }),
    );
    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream("session-1").subscribe((event) => emitted.push(event));
    const runner = new WorkflowRunner(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ stream: ["Opšti ", "odgovor."] }),
      { enqueue: jest.fn() },
    );

    await runner.run("answering", payload("job-answer"));

    expect(prisma.chatMessage.update).toHaveBeenLastCalledWith({
      where: { id: "message-answer" },
      data: {
        content: "Opšti odgovor.",
        status: "COMPLETED",
        metadata: { outcome: "ANSWER" },
      },
    });
    expect(
      emitted
        .filter((event) => event.type === "message.delta")
        .map((event) => event.delta),
    ).toEqual(["Opšti ", "odgovor."]);
    expect(emitted).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "message.started",
          correlationId: "corr-1",
        }),
        expect.objectContaining({
          type: "message.updated",
          message: expect.objectContaining({
            content: "Opšti odgovor.",
            status: "COMPLETED",
          }),
        }),
        expect.objectContaining({
          type: "job.updated",
          job: expect.objectContaining({
            status: "COMPLETED",
            progressStage: "PREPARING_ANSWER",
          }),
        }),
      ]),
    );
  });

  it("emits persisted running and completed snapshots with progress stages", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      workspaceId: "workspace-1",
      sessionId: "session-1",
      status: "QUEUED",
      workflowName: "triage",
      correlationId: "corr-1",
      input: { actorId: "user-1", content: "Tužba", attachments: [] },
    });
    prisma.chatMessage.create.mockResolvedValue({
      id: "message-1",
      sessionId: "session-1",
      role: "ASSISTANT",
      content: "accepted",
      status: "COMPLETED",
      triageDecision: "NON_LEGAL",
      correlationId: "corr-1",
      metadata: {},
      createdAt: now,
    });
    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream("session-1").subscribe((event) => emitted.push(event));
    const runner = new WorkflowRunner(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ decision: "NON_LEGAL", reason: "not legal" }),
      { enqueue: jest.fn() },
    );

    await runner.run("triage", payload("job-1"));

    const jobEvents = emitted.filter((event) => event.type === "job.updated");
    expect(jobEvents).toEqual([
      expect.objectContaining({
        workspaceId: "workspace-1",
        correlationId: "corr-1",
        job: expect.objectContaining({
          status: "RUNNING",
          progressStage: "UNDERSTANDING_REQUEST",
        }),
      }),
      expect.objectContaining({
        job: expect.objectContaining({
          status: "COMPLETED",
          progressStage: "UNDERSTANDING_REQUEST",
        }),
      }),
    ]);
  });

  it("skips already-completed jobs (idempotent retry/replay)", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "COMPLETED",
      workflowName: "triage",
      correlationId: "corr-1",
    });
    const enqueue = jest.fn();
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({}),
      { enqueue },
    );

    await runner.run("triage", payload("job-1"));

    expect(prisma.workflowJob.update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
  });

  it("marks triage terminally FAILED (not rethrown) when the LLM call fails validation", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "QUEUED",
      workflowName: "triage",
      correlationId: "corr-1",
      input: { actorId: "user-1", content: "Tužba", attachments: [] },
    });
    const events = new ChatEventBus();
    const emitted: string[] = [];
    events.stream("session-1").subscribe((event) => emitted.push(event.type));
    const runner = new WorkflowRunner(
      prisma as never,
      events,
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ notADecision: true }),
      { enqueue: jest.fn() },
    );

    await expect(
      runner.run("triage", payload("job-1")),
    ).resolves.toBeUndefined();

    expect(prisma.workflowJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1" },
        data: expect.objectContaining({
          status: "FAILED",
          errorCode: "TRIAGE_FAILED",
        }),
      }),
    );
    expect(emitted).toContain("error");
  });

  it("propagates unexpected infra errors so BullMQ can retry", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "QUEUED",
      workflowName: "triage",
      correlationId: "corr-1",
      input: { actorId: "user-1", content: "Tužba", attachments: [] },
    });
    prisma.chatMessage.create.mockRejectedValue(new Error("db unavailable"));
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider({ decision: "NON_LEGAL", reason: "not legal" }),
      { enqueue: jest.fn() },
    );

    await expect(runner.run("triage", payload("job-1"))).rejects.toThrow(
      "db unavailable",
    );
  });

  it("chains brief-extraction -> drafting via the injected queue for a lawsuit brief", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-2", {
      status: "QUEUED",
      workflowName: "brief-extraction",
      correlationId: "corr-1",
      input: {
        actorId: "user-1",
        messageId: "msg-1",
        userText: "Tužba za naknadu štete",
        attachments: [],
      },
    });
    const fakeBrief = {
      jobType: "lawsuit",
      plaintiff: { name: "Petar", address: null },
      defendant: { name: "Marko", address: null },
      competentCourt: null,
      claimValue: null,
      legalBasis: [],
      factualDescription: null,
      evidence: [],
      reliefSought: null,
      missingFields: [],
      confidence: 0.9,
      warnings: [],
    };
    prisma.briefExtractionResult.create.mockResolvedValue({
      id: "brief-result-1",
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);
    const runner = new WorkflowRunner(
      prisma as never,
      new ChatEventBus(),
      { save: jest.fn(), read: jest.fn() } as never,
      new ChatRuntimeConfig(),
      new FakeChatModelProvider(fakeBrief),
      { enqueue },
    );

    await runner.run("brief-extraction", payload("job-2"));

    expect(enqueue).toHaveBeenCalledWith(
      "drafting",
      expect.any(String),
      expect.objectContaining({
        workspaceId: "workspace-1",
        sessionId: "session-1",
        correlationId: "corr-1",
        messageId: "msg-1",
      }),
    );
  });
});
