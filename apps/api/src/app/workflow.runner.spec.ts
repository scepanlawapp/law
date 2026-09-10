import { FakeChatModelProvider } from "@law/llm";
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
    chatMessage: { create: jest.fn() },
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
      new FakeChatModelProvider({ decision: "LEGAL", reason: "ok" }),
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
