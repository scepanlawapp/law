import { NotFoundException } from "@nestjs/common";
import type { ChatStreamEvent } from "@law/api-interfaces";
import type { AssistantTurnScope } from "@law/mastra";
import {
  AssistantActionsService,
  ChatEventBus,
  belgradeToday,
} from "@law/chat";

const scope: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-turn",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
};

const matter = {
  id: "case-21",
  caseNumber: "2026-21",
  name: "Poništaj rešenja o otkazu",
  clientId: "client-1",
  responsibleUserId: "lawyer-1",
  client: { displayName: "Petar Petrović" },
};

function nextYearDate(): string {
  const [year, month, day] = belgradeToday().split("-");
  return `${Number(year) + 1}-${month}-${day}`;
}

function prismaMock() {
  const actions = new Map<string, Record<string, unknown>>();
  const jobs = new Map<string, Record<string, unknown>>([
    [
      "job-turn",
      {
        id: "job-turn",
        workspaceId: "workspace-1",
        sessionId: "session-1",
        workflowName: "agent-turn",
        status: "WAITING_CONFIRMATION",
        correlationId: "corr-1",
        input: { messageId: "message-1", language: "sr" },
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ],
  ]);
  const matches = (
    row: Record<string, unknown>,
    where: Record<string, unknown>,
  ) =>
    Object.entries(where).every(([key, value]) =>
      value && typeof value === "object" && "in" in (value as object)
        ? (value as { in: unknown[] }).in.includes(row[key])
        : row[key] === value,
    );
  return {
    actions,
    jobs,
    pendingAction: {
      findUnique: jest.fn(({ where }: { where: { idempotencyKey: string } }) =>
        Promise.resolve(
          [...actions.values()].find(
            (row) => row["idempotencyKey"] === where.idempotencyKey,
          ) ?? null,
        ),
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: `action-${actions.size + 1}`,
          status: "PENDING",
          result: null,
          errorMessage: null,
          decidedAt: null,
          decidedByUserId: null,
          declineReason: null,
          createdAt: new Date(Date.now() + actions.size),
          ...data,
        };
        actions.set(row.id, row);
        return Promise.resolve(row);
      }),
      findFirst: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...actions.values()].find((row) => matches(row, where)) ?? null,
        ),
      ),
      findUniqueOrThrow: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(actions.get(where.id)),
      ),
      updateMany: jest.fn(
        ({
          where,
          data,
        }: {
          where: Record<string, unknown>;
          data: Record<string, unknown>;
        }) => {
          const targets = [...actions.values()].filter((row) =>
            matches(row, where),
          );
          targets.forEach((row) =>
            actions.set(String(row["id"]), { ...row, ...data }),
          );
          return Promise.resolve({ count: targets.length });
        },
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...actions.get(where.id), ...data };
          actions.set(where.id, row);
          return Promise.resolve(row);
        },
      ),
      count: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...actions.values()].filter((row) => matches(row, where)).length,
        ),
      ),
      findMany: jest.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          [...actions.values()].filter((row) => matches(row, where)),
        ),
      ),
    },
    chatSession: {
      findFirst: jest.fn().mockResolvedValue({ id: "session-1" }),
    },
    case: {
      findMany: jest.fn().mockResolvedValue([matter]),
      findFirst: jest.fn().mockResolvedValue(matter),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        firstName: "Ana",
        lastName: "Jović",
        email: "ana@example.test",
      }),
    },
    briefExtractionResult: { findFirst: jest.fn() },
    activityLog: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    workflowJob: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(jobs.get(where.id) ?? null),
      ),
      update: jest.fn(
        ({
          where,
          data,
        }: {
          where: { id: string };
          data: Record<string, unknown>;
        }) => {
          const row = { ...jobs.get(where.id), ...data, updatedAt: new Date() };
          jobs.set(where.id, row);
          return Promise.resolve(row);
        },
      ),
      create: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        const row = {
          id: "job-resume",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        jobs.set(row.id, row);
        return Promise.resolve(row);
      }),
    },
  };
}

function setup() {
  const prisma = prismaMock();
  const events = new ChatEventBus();
  const emitted: ChatStreamEvent[] = [];
  events.stream("session-1").subscribe((event) => emitted.push(event));
  const matterLink = {
    sessionCaseId: jest.fn().mockResolvedValue("case-21"),
    linkSession: jest.fn().mockResolvedValue({
      caseId: "case-21",
      case: { caseNumber: "2026-21" },
      title: "Chat",
      updatedAt: new Date().toISOString(),
    }),
    previewTasks: jest.fn(),
    applyTasks: jest.fn(),
  };
  const work = {
    createDeadline: jest.fn().mockResolvedValue({ id: "deadline-1" }),
  };
  const queue = { enqueue: jest.fn().mockResolvedValue(undefined) };
  const service = new AssistantActionsService(
    prisma as never,
    events,
    matterLink as never,
    queue,
    work as never,
  );
  return { service, prisma, emitted, matterLink, work, queue };
}

const deadline = () => ({
  type: "create_deadline" as const,
  title: "Odgovor na tužbu",
  dueDate: nextYearDate(),
  deadlineType: "COURT" as const,
});

describe("AssistantActionsService.propose", () => {
  it("stores a normalized proposal for the linked case and writes nothing else", async () => {
    const { service, prisma, emitted, work } = setup();

    const result = await service.propose(scope, deadline());

    expect(result).toMatchObject({
      status: "CONFIRMATION_REQUIRED",
      pendingActionId: "action-1",
      summary: expect.stringContaining("Novi rok: Odgovor na tužbu"),
      details: expect.arrayContaining([
        "Predmet: 2026-21 – Poništaj rešenja o otkazu",
        "Vrsta roka: sudski",
        "Odgovoran: Ana Jović",
      ]),
    });
    expect(prisma.actions.get("action-1")).toMatchObject({
      status: "PENDING",
      jobId: "job-turn",
      correlationId: "corr-1",
      actionType: "create_deadline",
      payload: expect.objectContaining({
        caseId: "case-21",
        clientId: "client-1",
        responsibleUserId: "lawyer-1",
        type: "COURT",
        timeZone: "Europe/Belgrade",
      }),
      expiresAt: expect.any(Date),
    });
    expect(work.createDeadline).not.toHaveBeenCalled();
    expect(emitted.map((event) => event.type)).toEqual([
      "confirmation.required",
    ]);
    expect(emitted[0].pendingAction).toMatchObject({
      id: "action-1",
      status: "PENDING",
    });
  });

  it("is idempotent within a turn", async () => {
    const { service, prisma, emitted } = setup();

    const first = await service.propose(scope, deadline());
    const second = await service.propose(scope, deadline());

    expect(second).toEqual(first);
    expect(prisma.actions.size).toBe(1);
    expect(emitted).toHaveLength(1);
  });

  it.each([
    [{ ...deadline(), dueDate: "2020-01-01" }, "u prošlosti"],
    [{ ...deadline(), dueDate: "2026-02-30" }, "nije ispravan"],
  ])("rejects invalid deadline dates (%o)", async (request, message) => {
    const { service, prisma } = setup();

    await expect(service.propose(scope, request)).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining(message),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("asks for a case when the conversation is not linked", async () => {
    const { service, matterLink } = setup();
    matterLink.sessionCaseId.mockResolvedValue(null);

    await expect(service.propose(scope, deadline())).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("nije povezan"),
    });
  });

  it("lists candidates for an ambiguous case reference", async () => {
    const { service, prisma } = setup();
    prisma.case.findMany.mockResolvedValue([
      { ...matter, caseNumber: "2026-20", name: "Spor A" },
      { ...matter, caseNumber: "2026-22", name: "Spor B" },
    ]);

    await expect(
      service.propose(scope, { type: "link_case", caseReference: "Spor" }),
    ).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("2026-20 (Spor A); 2026-22 (Spor B)"),
    });
  });

  it("refuses to link a conversation to its current case", async () => {
    const { service } = setup();

    await expect(
      service.propose(scope, { type: "link_case", caseReference: "2026-21" }),
    ).resolves.toMatchObject({ status: "INVALID" });
  });

  it("requires the brief to be applied to a case before proposing tasks", async () => {
    const { service, prisma } = setup();
    prisma.briefExtractionResult.findFirst.mockResolvedValue({
      id: "brief-1",
      appliedCaseId: null,
    });

    await expect(
      service.propose(scope, { type: "create_tasks_from_brief" }),
    ).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("Case-work"),
    });
  });

  it("proposes only tasks that were not created yet", async () => {
    const { service, prisma, matterLink } = setup();
    prisma.briefExtractionResult.findFirst.mockResolvedValue({
      id: "brief-1",
      appliedCaseId: "case-21",
    });
    matterLink.previewTasks.mockResolvedValue({
      briefId: "brief-1",
      caseId: "case-21",
      proposals: [
        { key: "missing:0", title: "Adresa tuženog", alreadyApplied: false },
        { key: "evidence:0", title: "Platni listić", alreadyApplied: true },
      ],
    });

    const result = await service.propose(scope, {
      type: "create_tasks_from_brief",
    });

    expect(result).toMatchObject({
      status: "CONFIRMATION_REQUIRED",
      details: ["• Adresa tuženog"],
    });
    expect(prisma.actions.get("action-1")?.["payload"]).toEqual({
      briefId: "brief-1",
      caseId: "case-21",
      keys: ["missing:0"],
    });
  });
});

describe("AssistantActionsService.decide", () => {
  const decide = (
    service: AssistantActionsService,
    decision: "APPROVE" | "DECLINE",
    extra: Partial<{ workspaceId: string; reason: string }> = {},
  ) =>
    service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision,
      ...extra,
    });

  it("executes an approved deadline once, tags it AI_ASSISTED, and resumes the agent", async () => {
    const { service, prisma, emitted, work, queue } = setup();
    await service.propose(scope, deadline());

    const [first, second] = await Promise.all([
      decide(service, "APPROVE"),
      decide(service, "APPROVE"),
    ]);

    expect(work.createDeadline).toHaveBeenCalledTimes(1);
    expect(work.createDeadline).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Odgovor na tužbu",
        type: "COURT",
        caseId: "case-21",
        responsibleUserId: "lawyer-1",
      }),
    );
    expect(prisma.activityLog.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        entityType: "Deadline",
        entityId: "deadline-1",
      }),
      data: {
        metadata: { source: "AI_ASSISTED", pendingActionId: "action-1" },
      },
    });
    const final = prisma.actions.get("action-1");
    expect(final).toMatchObject({
      status: "APPROVED",
      decidedByUserId: "user-approver",
      result: expect.objectContaining({
        deadlineId: "deadline-1",
        message: expect.not.stringMatching(/\.\.$/),
      }),
    });
    expect([first.status, second.status]).toContain("APPROVED");
    expect(prisma.jobs.get("job-turn")).toMatchObject({ status: "COMPLETED" });
    expect(prisma.jobs.get("job-resume")).toMatchObject({
      workflowName: "agent-resume",
      correlationId: "corr-1",
      input: expect.objectContaining({
        messageId: "message-1",
        resumeActionIds: ["action-1"],
      }),
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
    expect(queue.enqueue).toHaveBeenCalledWith(
      "agent-resume",
      "job-resume",
      expect.objectContaining({ correlationId: "corr-1" }),
    );
    expect(emitted.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "confirmation.updated",
        "job.updated",
        "job.queued",
      ]),
    );
  });

  it("declines without executing and records the reason", async () => {
    const { service, prisma, work, queue } = setup();
    await service.propose(scope, deadline());

    const result = await decide(service, "DECLINE", {
      reason: "Pogrešan datum",
    });

    expect(result.status).toBe("DECLINED");
    expect(work.createDeadline).not.toHaveBeenCalled();
    expect(prisma.actions.get("action-1")).toMatchObject({
      declineReason: "Pogrešan datum",
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "agent-resume",
      expect.any(String),
      expect.any(Object),
    );
  });

  it("records a failed execution", async () => {
    const { service, work } = setup();
    work.createDeadline.mockRejectedValue(
      new Error("Responsible user is not a member"),
    );
    await service.propose(scope, deadline());

    await expect(decide(service, "APPROVE")).resolves.toMatchObject({
      status: "FAILED",
      errorMessage: "Responsible user is not a member",
    });
  });

  it("expires stale proposals without executing them", async () => {
    const { service, prisma, work } = setup();
    await service.propose(scope, deadline());
    prisma.actions.set("action-1", {
      ...prisma.actions.get("action-1"),
      expiresAt: new Date(Date.now() - 1000),
    });

    await expect(decide(service, "APPROVE")).resolves.toMatchObject({
      status: "EXPIRED",
    });
    expect(work.createDeadline).not.toHaveBeenCalled();
  });

  it("resumes only after the turn's last proposal is decided", async () => {
    const { service, queue } = setup();
    await service.propose(scope, deadline());
    await service.propose(scope, {
      ...deadline(),
      title: "Priprema za ročište",
    });

    await decide(service, "DECLINE");
    expect(queue.enqueue).not.toHaveBeenCalled();

    await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-2",
      decision: "DECLINE",
    });
    expect(queue.enqueue).toHaveBeenCalledTimes(1);
  });

  it("does not reveal proposals of another workspace", async () => {
    const { service } = setup();
    await service.propose(scope, deadline());

    await expect(
      decide(service, "APPROVE", { workspaceId: "workspace-2" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
