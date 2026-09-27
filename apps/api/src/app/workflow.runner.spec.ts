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
    workflowJobs,
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
        workflowJobs.set(id, {
          id,
          workspaceId: "workspace-1",
          sessionId: "session-1",
          createdAt: now,
          updatedAt: now,
          ...record,
        });
      },
    },
    chatMessage: {
      create: jest.fn(),
      findFirst: jest.fn().mockResolvedValue({ id: "message-user" }),
    },
  };
}

function payload(jobId: string): WorkflowJobPayload {
  return {
    workspaceId: "workspace-1",
    sessionId: "session-1",
    jobId,
    correlationId: "corr-1",
    messageId: "message-user",
  };
}

function runner(
  prisma: ReturnType<typeof prismaMock>,
  provider: FakeChatModelProvider,
  options: {
    events?: ChatEventBus;
    enqueue?: jest.Mock;
    agentTurn?: { run: jest.Mock };
    drafting?: { runBriefJob: jest.Mock; runDraftingJob: jest.Mock };
  } = {},
) {
  return new WorkflowRunner(
    prisma as never,
    options.events ?? new ChatEventBus(),
    new ChatRuntimeConfig(),
    provider,
    { enqueue: options.enqueue ?? jest.fn() },
    undefined,
    options.agentTurn as never,
    options.drafting as never,
  );
}

const nonLegalReply = {
  id: "message-1",
  sessionId: "session-1",
  role: "ASSISTANT",
  content: "rejected",
  status: "COMPLETED",
  triageDecision: null,
  correlationId: "corr-1",
  metadata: {},
  createdAt: now,
};

describe("WorkflowRunner", () => {
  it("answers non-legal requests itself and emits running/completed snapshots", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "QUEUED",
      workflowName: "triage",
      correlationId: "corr-1",
      input: { actorId: "user-1", content: "Vreme?", attachments: [] },
    });
    prisma.chatMessage.create.mockResolvedValue(nonLegalReply);
    const events = new ChatEventBus();
    const emitted: ChatStreamEvent[] = [];
    events.stream("session-1").subscribe((event) => emitted.push(event));
    const enqueue = jest.fn();

    await runner(
      prisma,
      new FakeChatModelProvider({ decision: "NON_LEGAL", reason: "not legal" }),
      { events, enqueue },
    ).run("triage", payload("job-1"));

    expect(prisma.chatMessage.create).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(
      emitted
        .filter((event) => event.type === "job.updated")
        .map((event) => [event.job?.status, event.job?.progressStage]),
    ).toEqual([
      ["RUNNING", "UNDERSTANDING_REQUEST"],
      ["COMPLETED", "UNDERSTANDING_REQUEST"],
    ]);
  });

  it("queues exactly one agent turn for any legal request", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "QUEUED",
      workflowName: "triage",
      correlationId: "corr-1",
      input: { actorId: "user-1", content: "Pripremi tužbu.", attachments: [] },
    });
    const enqueue = jest.fn().mockResolvedValue(undefined);

    await runner(
      prisma,
      new FakeChatModelProvider({
        decision: "LEGAL",
        reason: "Lawsuit",
        intent: "DRAFT",
        language: "sr",
      }),
      { enqueue },
    ).run("triage", payload("job-1"));

    expect(enqueue.mock.calls.map(([name]) => name)).toEqual(["agent-turn"]);
    expect(prisma.workflowJob.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workflowName: "agent-turn",
        input: expect.objectContaining({
          messageId: "message-user",
          intent: "DRAFT",
          language: "sr",
        }),
      }),
    });
  });

  it("skips completed and waiting jobs (idempotent retry/replay)", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-1", {
      status: "COMPLETED",
      workflowName: "triage",
    });
    prisma.workflowJob.seed("job-2", {
      status: "WAITING_CONFIRMATION",
      workflowName: "agent-turn",
    });
    const agentTurn = { run: jest.fn() };
    const enqueue = jest.fn();
    const workflowRunner = runner(prisma, new FakeChatModelProvider({}), {
      enqueue,
      agentTurn,
    });

    await workflowRunner.run("triage", payload("job-1"));
    await workflowRunner.run("agent-turn", payload("job-2"));

    expect(prisma.workflowJob.update).not.toHaveBeenCalled();
    expect(enqueue).not.toHaveBeenCalled();
    expect(agentTurn.run).not.toHaveBeenCalled();
  });

  it("marks triage terminally FAILED (not rethrown) when the model output is invalid", async () => {
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

    await expect(
      runner(prisma, new FakeChatModelProvider({ notADecision: true }), {
        events,
      }).run("triage", payload("job-1")),
    ).resolves.toBeUndefined();

    expect(prisma.workflowJobs.get("job-1")).toMatchObject({
      status: "FAILED",
      errorCode: "TRIAGE_FAILED",
    });
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

    await expect(
      runner(
        prisma,
        new FakeChatModelProvider({
          decision: "NON_LEGAL",
          reason: "not legal",
        }),
      ).run("triage", payload("job-1")),
    ).rejects.toThrow("db unavailable");
  });

  it("runs a historical answering job as an agent turn for its correlated user message", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-old", {
      status: "QUEUED",
      workflowName: "answering",
      correlationId: "corr-1",
      input: { userText: "Rok zastarelosti?", attachments: [], language: "sr" },
    });
    const agentTurn = {
      run: jest.fn(async (_input, _payload, job) => {
        await job.transition("COMPLETED", {
          progressStage: "PREPARING_ANSWER",
        });
      }),
    };

    await runner(prisma, new FakeChatModelProvider({}), { agentTurn }).run(
      "answering",
      payload("job-old"),
    );

    expect(prisma.chatMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          sessionId: "session-1",
          correlationId: "corr-1",
          role: "USER",
        },
      }),
    );
    expect(agentTurn.run).toHaveBeenCalledWith(
      {
        messageId: "message-user",
        userText: "Rok zastarelosti?",
        attachments: [],
        language: "sr",
        intent: "ANSWER",
      },
      payload("job-old"),
      expect.any(Object),
    );
    expect(prisma.workflowJobs.get("job-old")).toMatchObject({
      status: "COMPLETED",
    });
  });

  it("delegates queued brief-extraction and drafting jobs to the Mastra drafting service", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-brief", {
      status: "FAILED",
      workflowName: "brief-extraction",
      correlationId: "corr-1",
      input: { messageId: "message-user", userText: "Tužba", attachments: [] },
    });
    prisma.workflowJob.seed("job-draft", {
      status: "QUEUED",
      workflowName: "drafting",
      correlationId: "corr-1",
      input: {
        briefResultId: "brief-1",
        previousDraftId: "draft-1",
        reviewerNote: "Skrati.",
      },
    });
    const drafting = {
      runBriefJob: jest.fn().mockResolvedValue({ status: "DRAFT_READY" }),
      runDraftingJob: jest.fn().mockResolvedValue({ status: "DRAFT_READY" }),
    };
    const workflowRunner = runner(prisma, new FakeChatModelProvider({}), {
      drafting,
    });

    await workflowRunner.run("brief-extraction", payload("job-brief"));
    await workflowRunner.run("drafting", payload("job-draft"));

    expect(drafting.runBriefJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-brief", status: "RUNNING" }),
    );
    expect(drafting.runDraftingJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-draft", status: "RUNNING" }),
    );
  });

  it("fails agent and drafting jobs clearly when their services are not wired", async () => {
    const prisma = prismaMock();
    prisma.workflowJob.seed("job-turn", {
      status: "QUEUED",
      workflowName: "agent-turn",
      correlationId: "corr-1",
      input: { messageId: "message-user" },
    });
    prisma.workflowJob.seed("job-draft", {
      status: "QUEUED",
      workflowName: "drafting",
      correlationId: "corr-1",
      input: { briefResultId: "brief-1" },
    });
    const workflowRunner = runner(prisma, new FakeChatModelProvider({}));

    await workflowRunner.run("agent-turn", payload("job-turn"));
    await workflowRunner.run("drafting", payload("job-draft"));

    expect(prisma.workflowJobs.get("job-turn")).toMatchObject({
      status: "FAILED",
      errorCode: "AGENT_TURN_UNAVAILABLE",
    });
    expect(prisma.workflowJobs.get("job-draft")).toMatchObject({
      status: "FAILED",
      errorCode: "DRAFTING_UNAVAILABLE",
    });
  });
});
