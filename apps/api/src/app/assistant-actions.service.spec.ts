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
  userId: null,
  userDisplayName: null,
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

function clientRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "client-1",
    type: "INDIVIDUAL",
    displayName: "Petar Petrović",
    firstName: "Petar",
    lastName: "Petrović",
    jmbg: null,
    registrationNumber: null,
    taxNumber: null,
    addresses: [],
    identificationDocuments: [],
    ...overrides,
  };
}

const JMBG = "0101990710006";

function factsResult(
  facts: Array<Record<string, unknown>> = [],
  overrides: Record<string, unknown> = {},
) {
  return {
    status: "OK" as const,
    subjects: [
      {
        ref: "doc:doc-1",
        title: "Lična karta Petar Petrović",
        documentKind: "ID_CARD",
        subjectKey: "s1",
        subjectType: "PERSON",
        subjectRole: null,
        facts: [
          {
            field: "fullName",
            value: "PETAR PETROVIĆ",
            quote: "PETAR PETROVIĆ",
            confidence: 0.9,
          },
          {
            field: "jmbg",
            value: "0101990 710006",
            quote: "JMBG 0101990710006",
            confidence: 0.9,
          },
          {
            field: "address",
            value: "Kneza Miloša 10, 11000 Beograd",
            quote: "Adresa Kneza Miloša 10, 11000 Beograd",
            confidence: 0.8,
          },
          ...facts,
        ],
        ...overrides,
      },
    ],
    conflicts: [],
    notIndexed: [],
    aiAccessOff: [],
  };
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
    activityLog: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    documentClient: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ documentId: "doc-1", clientId: "client-1" }]),
    },
    client: {
      findFirst: jest.fn().mockResolvedValue(clientRow()),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    documentFact: { count: jest.fn().mockResolvedValue(3) },
    document: {
      findFirst: jest.fn().mockResolvedValue({
        archivedAt: null,
        aiAccess: true,
        clients: [{ clientId: "client-1" }],
      }),
    },
    clientAddress: { create: jest.fn().mockResolvedValue({}) },
    clientIdentificationDocument: { create: jest.fn().mockResolvedValue({}) },
    clientActivity: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn(),
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
  const workEntries = {
    create: jest.fn().mockImplementation((input: Record<string, unknown>) =>
      Promise.resolve({ id: "entry-1", title: input["title"], minutes: input["minutes"] }),
    ),
  };
  const documents = {
    getDocumentFacts: jest.fn().mockResolvedValue(factsResult()),
  };
  const tx = prisma;
  prisma.$transaction.mockImplementation((run: (tx: unknown) => unknown) =>
    Promise.resolve(run(tx)),
  );
  const service = new AssistantActionsService(
    prisma as never,
    events,
    matterLink as never,
    queue,
    work as never,
    documents as never,
    workEntries as never,
  );
  return {
    service,
    prisma,
    emitted,
    matterLink,
    work,
    queue,
    documents,
    workEntries,
  };
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
        metadata: {
          source: "AI_ASSISTED",
          pendingActionId: "action-1",
          mode: "CARD",
        },
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

describe("AssistantActionsService client updates from document facts", () => {
  const request = {
    type: "update_client_from_document" as const,
    documentRef: "doc:doc-1",
    subjectKey: "s1",
  };

  it("proposes the empty fields of the matching client and writes nothing", async () => {
    const { service, prisma, documents } = setup();

    const result = await service.propose(scope, request);

    expect(documents.getDocumentFacts).toHaveBeenCalledWith(scope, {
      ref: "doc:doc-1",
    });
    expect(result).toMatchObject({
      status: "CONFIRMATION_REQUIRED",
      summary:
        'Dopuna podataka klijenta Petar Petrović iz dokumenta „Lična karta Petar Petrović"',
    });
    expect(result).toHaveProperty("details");
    const details = (result as { details: string[] }).details.join("\n");
    expect(details).toContain(`JMBG: ${JMBG}`);
    expect(details).toContain("JMBG 0101990710006");
    expect(details).toContain("Adresa: Kneza Miloša 10, 11000 Beograd");
    expect(prisma.actions.get("action-1")).toMatchObject({
      actionType: "update_client_from_document",
      payload: {
        clientId: "client-1",
        documentId: "doc-1",
        fill: [
          expect.objectContaining({ field: "jmbg", value: JMBG }),
          expect.objectContaining({
            field: "address",
            address: expect.objectContaining({
              street: "Kneza Miloša 10",
              city: "Beograd",
              postalCode: "11000",
            }),
          }),
        ],
      },
    });
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientAddress.create).not.toHaveBeenCalled();
    expect(prisma.documentClient.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: "workspace-1", documentId: "doc-1" },
      }),
    );
  });

  it("refuses a document the assistant may not read", async () => {
    const { service, prisma, documents } = setup();
    documents.getDocumentFacts.mockResolvedValue({
      status: "AI_ACCESS_OFF",
      message: "Dokument ima isključen pristup asistenta.",
    });

    await expect(service.propose(scope, request)).resolves.toEqual({
      status: "INVALID",
      message: "Dokument ima isključen pristup asistenta.",
    });
    expect(prisma.actions.size).toBe(0);
    expect(prisma.documentClient.findMany).not.toHaveBeenCalled();
  });

  it("refuses an unfiled chat attachment", async () => {
    const { service, documents } = setup();

    await expect(
      service.propose(scope, { ...request, documentRef: "att:att-1" }),
    ).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("predmet"),
    });
    expect(documents.getDocumentFacts).not.toHaveBeenCalled();
  });

  it("refuses a subject the document does not have", async () => {
    const { service } = setup();

    await expect(
      service.propose(scope, { ...request, subjectKey: "s9" }),
    ).resolves.toMatchObject({ status: "INVALID" });
  });

  it.each([
    [[], "nije povezan"],
    [[{ clientId: "client-1" }, { clientId: "client-2" }], "više klijenata"],
  ])("requires exactly one linked client (%j)", async (links, message) => {
    const { service, prisma } = setup();
    prisma.documentClient.findMany.mockResolvedValue(links);

    await expect(service.propose(scope, request)).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining(message),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("refuses a subject that is not the linked client (opposing party)", async () => {
    const { service, prisma } = setup();
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ firstName: "Marko", lastName: "Marković" }),
    );

    await expect(service.propose(scope, request)).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("ne odgovara"),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("warns about a different JMBG and proposes nothing", async () => {
    const { service, prisma } = setup();
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ jmbg: "1212985710008" }),
    );

    const result = await service.propose(scope, request);

    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("1212985710008"),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("says when the client has nothing left to fill", async () => {
    const { service, prisma } = setup();
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ jmbg: JMBG, addresses: [{ id: "a" }] }),
    );

    await expect(service.propose(scope, request)).resolves.toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("nema praznih polja"),
    });
  });

  it("scopes the client lookup to the workspace", async () => {
    const { service, prisma } = setup();
    await service.propose(scope, request);

    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "client-1", workspaceId: "workspace-1" },
      }),
    );
  });

  async function approve(
    service: AssistantActionsService,
  ): Promise<{ status: string; resultMessage: string | null }> {
    await service.propose(scope, request);
    return (await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    })) as never;
  }

  it("writes the approved fields and logs the change with AI source", async () => {
    const { service, prisma } = setup();

    const decided = await approve(service);

    expect(decided.status).toBe("APPROVED");
    expect(prisma.client.updateMany).toHaveBeenCalledWith({
      where: {
        id: "client-1",
        workspaceId: "workspace-1",
        OR: [{ jmbg: null }, { jmbg: "" }],
      },
      data: { jmbg: JMBG, updatedByUserId: "user-approver" },
    });
    expect(prisma.clientAddress.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "client-1",
        street: "Kneza Miloša 10",
        city: "Beograd",
        postalCode: "11000",
        country: "RS",
        isPrimary: true,
      }),
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        workspaceId: "workspace-1",
        actorUserId: "user-approver",
        action: "CLIENT_UPDATED",
        entityType: "Client",
        entityId: "client-1",
        clientId: "client-1",
        metadata: expect.objectContaining({
          source: "AI_ASSISTED",
          pendingActionId: "action-1",
          documentId: "doc-1",
          applied: ["jmbg", "address"],
          skipped: [],
        }),
      }),
    });
    expect(prisma.clientActivity.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        clientId: "client-1",
        source: "AI",
        createdByUserId: "user-approver",
      }),
    });
    expect(prisma.actions.get("action-1")?.["result"]).toMatchObject({
      applied: ["jmbg", "address"],
      skipped: [],
    });
    expect(decided.resultMessage).toContain("dopunjeno (JMBG, Adresa)");
  });

  it("skips a field that was filled between proposal and approval", async () => {
    const { service, prisma } = setup();
    await service.propose(scope, request);
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ jmbg: "1212985710008", addresses: [{ id: "a1" }] }),
    );

    const decided = (await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    })) as never as { status: string };

    expect(decided.status).toBe("APPROVED");
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientAddress.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.actions.get("action-1")?.["result"]).toMatchObject({
      applied: [],
      skipped: ["jmbg", "address"],
    });
  });

  it("creates an identification document only when its number is new", async () => {
    const { service, prisma, documents } = setup();
    documents.getDocumentFacts.mockResolvedValue(
      factsResult([
        {
          field: "documentNumber",
          value: "012345678",
          quote: "Br. 012345678",
          confidence: 0.9,
        },
        {
          field: "issuedDate",
          value: "01.02.2020.",
          quote: "Izdato 01.02.2020.",
          confidence: 0.9,
        },
      ]),
    );
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ jmbg: JMBG, addresses: [{ id: "a1" }] }),
    );
    await service.propose(scope, request);
    expect(prisma.actions.get("action-1")).toMatchObject({
      payload: {
        fill: [
          expect.objectContaining({
            field: "identificationDocument",
            identificationDocument: expect.objectContaining({
              type: "LICNA_KARTA",
              issuedDate: "2020-02-01",
              expiredDate: null,
              country: "RS",
            }),
          }),
        ],
      },
    });
    prisma.client.findFirst.mockResolvedValue(
      clientRow({
        jmbg: JMBG,
        addresses: [{ id: "a1" }],
        identificationDocuments: [{ number: "012-345-678" }],
      }),
    );

    await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });
    expect(prisma.clientIdentificationDocument.create).not.toHaveBeenCalled();

    prisma.client.findFirst.mockResolvedValue(
      clientRow({ jmbg: JMBG, addresses: [{ id: "a1" }] }),
    );
    prisma.actions.set("action-1", {
      ...prisma.actions.get("action-1"),
      status: "PENDING",
    });
    await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });
    expect(prisma.clientIdentificationDocument.create).toHaveBeenCalledWith({
      data: {
        clientId: "client-1",
        type: "LICNA_KARTA",
        number: "012345678",
        issuedDate: new Date("2020-02-01"),
        expiredDate: null,
        country: "RS",
      },
    });
  });

  it("skips a field whose compare-and-set matched no row and logs only what was applied", async () => {
    const { service, prisma } = setup();
    await service.propose(scope, request);
    // Another request filled the JMBG after the re-read.
    prisma.client.updateMany.mockImplementation(
      ({ where }: { where: { OR?: unknown[] } }) =>
        Promise.resolve({ count: where.OR ? 0 : 1 }),
    );

    const decided = await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });

    expect(decided.status).toBe("APPROVED");
    expect(prisma.actions.get("action-1")?.["result"]).toMatchObject({
      applied: ["address"],
      skipped: ["jmbg"],
    });
    expect(prisma.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          applied: ["address"],
          skipped: ["jmbg"],
        }),
      }),
    });
  });

  it("writes no activity when every compare-and-set failed", async () => {
    const { service, prisma } = setup();
    prisma.client.findFirst.mockResolvedValue(
      clientRow({ addresses: [{ id: "a1" }] }),
    );
    await service.propose(scope, request);
    prisma.client.updateMany.mockResolvedValue({ count: 0 });

    const decided = await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });

    expect(decided.status).toBe("APPROVED");
    expect(decided.resultMessage).toContain("ništa nije promenjeno");
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
    expect(prisma.clientActivity.create).not.toHaveBeenCalled();
  });

  it.each([
    [
      "AI access was turned off",
      {
        archivedAt: null,
        aiAccess: false,
        clients: [{ clientId: "client-1" }],
      },
    ],
    [
      "it was re-linked to another client",
      {
        archivedAt: null,
        aiAccess: true,
        clients: [{ clientId: "client-2" }],
      },
    ],
    [
      "it was linked to a second client",
      {
        archivedAt: null,
        aiAccess: true,
        clients: [{ clientId: "client-1" }, { clientId: "client-2" }],
      },
    ],
    [
      "it was archived",
      {
        archivedAt: new Date(),
        aiAccess: true,
        clients: [{ clientId: "client-1" }],
      },
    ],
    ["it was deleted", null],
  ])("applies nothing and fails when %s after the proposal", async (_, row) => {
    const { service, prisma } = setup();
    await service.propose(scope, request);
    prisma.document.findFirst.mockResolvedValue(row);

    const decided = await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });

    expect(decided.status).toBe("FAILED");
    expect(decided.errorMessage).toBe(
      "Dokument više nije dostupan asistentu ili nije povezan sa klijentom.",
    );
    expect(prisma.document.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "doc-1", workspaceId: "workspace-1" },
      }),
    );
    expect(prisma.client.updateMany).not.toHaveBeenCalled();
    expect(prisma.clientAddress.create).not.toHaveBeenCalled();
    expect(prisma.activityLog.create).not.toHaveBeenCalled();
  });

  it("lists an identification document with an unknown nationality as skipped", async () => {
    const { service, prisma, documents } = setup();
    documents.getDocumentFacts.mockResolvedValue(
      factsResult([
        {
          field: "documentNumber",
          value: "P1234567",
          quote: "Br. P1234567",
          confidence: 0.9,
        },
        {
          field: "nationality",
          value: "Atlantida",
          quote: "Državljanstvo Atlantida",
          confidence: 0.9,
        },
      ]),
    );

    const result = await service.propose(scope, request);

    const details = (result as { details: string[] }).details;
    expect(details).toContain(
      "Preskočeno: Identifikaciona isprava (nepoznato državljanstvo).",
    );
    const fill = (
      prisma.actions.get("action-1")?.["payload"] as {
        fill: Array<{ field: string }>;
      }
    ).fill;
    expect(fill.map((item) => item.field)).toEqual(["jmbg", "address"]);
  });

  it("fails the action when the client is gone", async () => {
    const { service, prisma } = setup();
    await service.propose(scope, request);
    prisma.client.findFirst.mockResolvedValue(null);

    const decided = await service.decide({
      workspaceId: "workspace-1",
      userId: "user-approver",
      actionId: "action-1",
      decision: "APPROVE",
    });

    expect(decided.status).toBe("FAILED");
  });
});

describe("AssistantActionsService.clientUpdateHint", () => {
  it("is true when a case document of the client can fill an empty field", async () => {
    const { service, documents, prisma } = setup();

    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(true);
    expect(documents.getDocumentFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "workspace-1",
        sessionId: "session-1",
      }),
      {},
    );
    expect(prisma.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "case-21", workspaceId: "workspace-1" },
      }),
    );
  });

  it("runs one fact count and reads nothing else when the case has no person or company facts", async () => {
    const { service, prisma, documents } = setup();
    prisma.documentFact.count.mockResolvedValue(0);

    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);
    expect(prisma.documentFact.count).toHaveBeenCalledTimes(1);
    expect(prisma.documentFact.count).toHaveBeenCalledWith({
      where: {
        workspaceId: "workspace-1",
        subjectType: { in: ["PERSON", "COMPANY"] },
        content: {
          versions: {
            some: {
              currentFor: {
                workspaceId: "workspace-1",
                archivedAt: null,
                aiAccess: true,
                cases: { some: { caseId: "case-21" } },
              },
            },
          },
        },
      },
    });
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(prisma.client.findFirst).not.toHaveBeenCalled();
    expect(documents.getDocumentFacts).not.toHaveBeenCalled();
  });

  it("does not look up the session case again", async () => {
    const { service, matterLink } = setup();

    await service.clientUpdateHint("workspace-1", "session-1", "case-21");

    expect(matterLink.sessionCaseId).not.toHaveBeenCalled();
  });

  it("does not read documents when the client has nothing empty", async () => {
    const { service, prisma, documents } = setup();
    prisma.client.findFirst.mockResolvedValue(
      clientRow({
        jmbg: JMBG,
        addresses: [{ id: "a1" }],
        identificationDocuments: [{ number: "1" }],
      }),
    );

    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);
    expect(documents.getDocumentFacts).not.toHaveBeenCalled();
  });

  it.each([
    ["the opposing party", { firstName: "Marko", lastName: "Marković" }],
    ["a different JMBG", { jmbg: "1212985710008" }],
  ])("is false when the subject is %s", async (_, overrides) => {
    const { service, prisma } = setup();
    prisma.client.findFirst.mockResolvedValue(clientRow(overrides));

    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);
  });

  it("is false when facts are unavailable or the document has several clients", async () => {
    const { service, prisma, documents } = setup();
    documents.getDocumentFacts.mockResolvedValueOnce({
      status: "UNAVAILABLE",
      message: "x",
    });
    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);

    prisma.documentClient.findMany.mockResolvedValue([
      { documentId: "doc-1", clientId: "client-1" },
      { documentId: "doc-1", clientId: "client-2" },
    ]);
    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);
  });

  it("ignores unfiled chat attachments", async () => {
    const { service, documents } = setup();
    documents.getDocumentFacts.mockResolvedValue(
      factsResult([], { ref: "att:att-1" }),
    );

    await expect(
      service.clientUpdateHint("workspace-1", "session-1", "case-21"),
    ).resolves.toBe(false);
  });
});

describe("AssistantActionsService create_event and permission modes", () => {
  const owner: AssistantTurnScope = {
    ...scope,
    userId: "user-owner",
    userDisplayName: "Ana Jović",
  };
  const borkoClient = {
    id: "client-borko",
    displayName: "Borko Petrović",
    clientNumber: "K-0012",
  };
  const event = (overrides: Record<string, unknown> = {}) => ({
    type: "create_event" as const,
    title: "Sastanak sa Borkom",
    date: nextYearDate(),
    startTime: "12:00",
    participants: ["Borko"],
    ...overrides,
  });

  function eventSetup(
    options: {
      permissionMode?: "MANUAL" | "ASK" | "AUTO" | null;
      userDefault?: "MANUAL" | "ASK" | "AUTO";
      clients?: Array<Record<string, unknown>>;
      colleagues?: Array<Record<string, unknown>>;
      conflicts?: Array<Record<string, unknown>>;
    } = {},
  ) {
    const context = setup();
    const prisma = context.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma["chatSession"].findFirst.mockResolvedValue({
      id: "session-1",
      permissionMode: options.permissionMode ?? null,
      createdBy: {
        settings: options.userDefault
          ? { assistantPermissionMode: options.userDefault }
          : null,
      },
    });
    prisma["user"].findMany = jest
      .fn()
      .mockResolvedValue(options.colleagues ?? []);
    prisma["client"].findMany = jest
      .fn()
      .mockResolvedValue(options.clients ?? [borkoClient]);
    prisma["clientContact"] = {
      findMany: jest.fn().mockResolvedValue([]),
    };
    prisma["event"] = {
      findMany: jest.fn().mockResolvedValue(options.conflicts ?? []),
    };
    prisma["workspaceMember"] = {
      findFirst: jest.fn().mockResolvedValue({ role: "MEMBER" }),
    };
    // The linked case belongs to another client, so it is not attached.
    (context.work as unknown as Record<string, jest.Mock>)["createEvent"] = jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({
          id: "event-1",
          title: input["title"],
          startsAt: input["startsAt"],
        }),
      );
    return context;
  }

  it("resolves one client, converts Belgrade time, and asks by default", async () => {
    const { service, prisma, work } = eventSetup();

    const result = await service.propose(owner, event());

    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    const row = prisma.actions.get("action-1")!;
    expect(row).toMatchObject({ mode: "CARD", status: "PENDING" });
    expect(row["payload"]).toMatchObject({
      type: "MEETING",
      clientIds: ["client-borko"],
      assigneeUserIds: ["user-owner"],
      timeZone: "Europe/Belgrade",
    });
    expect(row["payload"]).not.toHaveProperty("caseId");
    const startsAt = new Date(String((row["payload"] as Record<string, unknown>)["startsAt"]));
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Belgrade",
        hour: "2-digit",
        minute: "2-digit",
      }).format(startsAt),
    ).toBe("12:00");
    expect(row["details"]).toEqual(
      expect.arrayContaining(["Učesnici: Borko Petrović (klijent K-0012)"]),
    );
    expect((work as unknown as Record<string, jest.Mock>)["createEvent"]).not.toHaveBeenCalled();
  });

  it("refuses an ambiguous name with every candidate and stores nothing", async () => {
    const { service, prisma } = eventSetup({
      clients: [borkoClient],
      colleagues: [
        { id: "user-borko", firstName: "Borko", lastName: "Ilić", email: "b@x.test" },
      ],
    });

    const result = await service.propose(owner, event());

    expect(result.status).toBe("INVALID");
    expect(result).toMatchObject({
      message: expect.stringContaining("Borko Ilić (kolega)"),
    });
    expect(result).toMatchObject({
      message: expect.stringContaining("Borko Petrović (klijent K-0012)"),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("refuses a time in the past", async () => {
    const { service } = eventSetup();
    const result = await service.propose(owner, event({ date: "2020-01-01" }));
    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("u prošlosti"),
    });
  });

  it("MANUAL mode stores a form with the prefill and waits", async () => {
    const { service, prisma, work } = eventSetup({ userDefault: "MANUAL" });

    const result = await service.propose(owner, event());

    expect(result).toMatchObject({ status: "FORM_REQUIRED" });
    expect(prisma.actions.get("action-1")).toMatchObject({
      mode: "FORM",
      status: "PENDING",
    });
    expect((work as unknown as Record<string, jest.Mock>)["createEvent"]).not.toHaveBeenCalled();
  });

  it("AUTO mode saves as the conversation owner without waiting", async () => {
    const { service, prisma, work, queue, emitted } = eventSetup({
      userDefault: "ASK",
      permissionMode: "AUTO",
    });
    const actors: Array<string | undefined> = [];
    const createEvent = (work as unknown as Record<string, jest.Mock>)["createEvent"];
    const { WorkspaceContextService } = await import("@law/core");
    createEvent.mockImplementation((input: Record<string, unknown>) => {
      actors.push(WorkspaceContextService.current?.userId);
      return Promise.resolve({
        id: "event-1",
        title: input["title"],
        startsAt: input["startsAt"],
      });
    });

    const result = await service.propose(owner, event());

    expect(result).toMatchObject({
      status: "EXECUTED",
      message: expect.stringContaining("12:00"),
    });
    expect(actors).toEqual(["user-owner"]);
    expect(prisma.actions.get("action-1")).toMatchObject({
      mode: "AUTO",
      status: "APPROVED",
      decidedByUserId: "user-owner",
      result: expect.objectContaining({ eventId: "event-1" }),
    });
    expect(prisma.activityLog.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({ entityType: "Event", entityId: "event-1" }),
      data: {
        metadata: {
          source: "AI_ASSISTED",
          pendingActionId: "action-1",
          mode: "AUTO",
        },
      },
    });
    expect(queue.enqueue).not.toHaveBeenCalled();
    expect(emitted.map((item) => item.type)).toContain("confirmation.required");
  });

  it("AUTO mode asks instead when the slot overlaps another event", async () => {
    const { service, prisma, work } = eventSetup({
      permissionMode: "AUTO",
      conflicts: [
        {
          title: "Ročište P-123/26",
          startsAt: new Date("2030-01-01T10:30:00Z"),
          endsAt: new Date("2030-01-01T11:30:00Z"),
        },
      ],
    });

    const result = await service.propose(owner, event());

    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    expect(prisma.actions.get("action-1")).toMatchObject({ mode: "CARD" });
    expect(prisma.actions.get("action-1")!["details"]).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^⚠ Preklapa se sa: Ročište P-123\/26/),
      ]),
    );
    expect((work as unknown as Record<string, jest.Mock>)["createEvent"]).not.toHaveBeenCalled();
  });

  it("never saves a deadline automatically", async () => {
    const { service, prisma, work } = eventSetup({ permissionMode: "AUTO" });
    const result = await service.propose(owner, deadline());
    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    expect(prisma.actions.get("action-1")).toMatchObject({ mode: "CARD" });
    expect(work.createDeadline).not.toHaveBeenCalled();
  });

  it("MANUAL mode opens a deadline form unless the caller forces a card", async () => {
    const { service, prisma } = eventSetup({ permissionMode: "MANUAL" });

    const form = await service.propose(owner, deadline());
    const card = await service.propose(
      owner,
      { ...deadline(), title: "Žalba" },
      { forceCard: true },
    );

    expect(form).toMatchObject({ status: "FORM_REQUIRED" });
    expect(card).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    expect(prisma.actions.get("action-2")).toMatchObject({ mode: "CARD" });
  });

  it("AUTO mode links the case directly", async () => {
    const { service, matterLink } = eventSetup({ permissionMode: "AUTO" });
    matterLink.sessionCaseId.mockResolvedValue(null);
    const result = await service.propose(owner, {
      type: "link_case",
      caseReference: "2026-21",
    });
    expect(result).toMatchObject({ status: "EXECUTED" });
    expect(matterLink.linkSession).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-owner", caseId: "case-21" }),
    );
  });

  it("saves the edited form, marks it edited, and resumes the agent", async () => {
    const { service, prisma, work, queue } = eventSetup({ userDefault: "MANUAL" });
    await service.propose(owner, event());
    const prefill = prisma.actions.get("action-1")!["payload"] as Record<string, unknown>;
    const later = new Date(new Date(String(prefill["startsAt"])).getTime() + 3600_000);

    const summary = await service.completeForm({
      workspaceId: "workspace-1",
      userId: "user-owner",
      actionId: "action-1",
      body: {
        ...prefill,
        // The form sends real record ids.
        clientIds: ["3f9a2c1e-8b7d-4e6f-a5c4-1d2e3f4a5b6c"],
        assigneeUserIds: ["0b6c4f2e-6f1d-4c8e-9a51-2f0f0b7f3a11"],
        startsAt: later.toISOString(),
        endsAt: new Date(later.getTime() + 3600_000).toISOString(),
      },
    });

    expect(summary).toMatchObject({ status: "APPROVED", mode: "FORM" });
    expect((work as unknown as Record<string, jest.Mock>)["createEvent"]).toHaveBeenCalledWith(
      expect.objectContaining({ startsAt: later.toISOString() }),
    );
    expect(prisma.actions.get("action-1")).toMatchObject({
      result: expect.objectContaining({ edited: true, eventId: "event-1" }),
    });
    expect(queue.enqueue).toHaveBeenCalledWith(
      "agent-resume",
      "job-resume",
      expect.anything(),
    );
  });

  it("rejects a form body the event DTO does not accept", async () => {
    const { service, prisma, work } = eventSetup({ userDefault: "MANUAL" });
    await service.propose(owner, event());
    await expect(
      service.completeForm({
        workspaceId: "workspace-1",
        userId: "user-owner",
        actionId: "action-1",
        body: { title: "Sastanak", startsAt: "sutra" },
      }),
    ).rejects.toThrow("Bad Request");
    expect(prisma.actions.get("action-1")).toMatchObject({ status: "PENDING" });
    expect((work as unknown as Record<string, jest.Mock>)["createEvent"]).not.toHaveBeenCalled();
  });

  it("refuses to complete an action that is not a form", async () => {
    const { service } = eventSetup();
    await service.propose(owner, event());
    await expect(
      service.completeForm({
        workspaceId: "workspace-1",
        userId: "user-owner",
        actionId: "action-1",
        body: {},
      }),
    ).rejects.toThrow("not a prefilled form");
  });
});

describe("AssistantActionsService tasks, work entries, and event changes", () => {
  const owner: AssistantTurnScope = {
    ...scope,
    userId: "user-owner",
    userDisplayName: "Ana Jović",
  };
  const marko = {
    id: "user-marko",
    firstName: "Marko",
    lastName: "Marković",
    email: "marko@example.test",
  };
  const borkoClient = {
    id: "client-borko",
    displayName: "Borko Petrović",
    clientNumber: "K-0012",
  };
  const upcoming = (overrides: Record<string, unknown> = {}) => {
    const startsAt = new Date(`${nextYearDate()}T10:00:00Z`);
    return {
      id: "event-7",
      type: "MEETING",
      title: "Sastanak sa Borkom",
      description: null,
      startsAt,
      endsAt: new Date(startsAt.getTime() + 3600_000),
      timeZone: "Europe/Belgrade",
      isAllDay: false,
      location: "Kancelarija",
      meetingUrl: null,
      courtName: null,
      courtroom: null,
      organizerUserId: "user-owner",
      caseId: null,
      clients: [{ clientId: "client-borko", client: { displayName: "Borko Petrović" } }],
      assignees: [{ userId: "user-owner" }],
      attendees: [],
      ...overrides,
    };
  };

  function modeSetup(
    options: {
      permissionMode?: "MANUAL" | "ASK" | "AUTO";
      users?: Array<Record<string, unknown>>;
      clients?: Array<Record<string, unknown>>;
      events?: Array<Record<string, unknown>>;
      conflicts?: Array<Record<string, unknown>>;
      linkedCase?: boolean;
    } = {},
  ) {
    const context = setup();
    const prisma = context.prisma as unknown as Record<
      string,
      Record<string, jest.Mock>
    >;
    prisma["chatSession"].findFirst.mockResolvedValue({
      id: "session-1",
      permissionMode: options.permissionMode ?? "ASK",
      createdBy: { settings: null },
    });
    if (options.linkedCase === false) {
      context.matterLink.sessionCaseId.mockResolvedValue(null);
    }
    prisma["user"].findMany = jest.fn().mockResolvedValue(options.users ?? []);
    prisma["client"].findMany = jest
      .fn()
      .mockResolvedValue(options.clients ?? []);
    prisma["clientContact"] = { findMany: jest.fn().mockResolvedValue([]) };
    prisma["event"] = {
      findMany: jest
        .fn()
        .mockResolvedValueOnce(options.events ?? [])
        .mockResolvedValue(options.conflicts ?? []),
    };
    prisma["workspaceMember"] = {
      findFirst: jest.fn().mockResolvedValue({ role: "MEMBER" }),
    };
    const work = context.work as unknown as Record<string, jest.Mock>;
    work["createTask"] = jest
      .fn()
      .mockImplementation((input: Record<string, unknown>) =>
        Promise.resolve({ id: "task-1", title: input["title"] }),
      );
    work["updateEvent"] = jest
      .fn()
      .mockImplementation((id: string, input: Record<string, unknown>) =>
        Promise.resolve({ id, title: input["title"], startsAt: input["startsAt"] }),
      );
    work["transitionEvent"] = jest
      .fn()
      .mockResolvedValue({ id: "event-7", title: "Sastanak sa Borkom" });
    return { ...context, work };
  }

  it("AUTO mode saves work as PROPOSED for the conversation owner", async () => {
    const { service, prisma, workEntries } = modeSetup({
      permissionMode: "AUTO",
      clients: [borkoClient],
      linkedCase: false,
    });

    const result = await service.propose(owner, {
      type: "log_work_entry",
      title: "Pregled ugovora",
      minutes: 90,
      client: "Borko",
    });

    expect(result).toMatchObject({
      status: "EXECUTED",
      message: expect.stringContaining("pregledu vremena"),
    });
    expect(workEntries.create).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "client-borko",
        userId: "user-owner",
        minutes: 90,
        workDate: belgradeToday(),
        aiParsed: true,
      }),
      { status: "PROPOSED" },
    );
    expect(prisma.actions.get("action-1")).toMatchObject({
      result: expect.objectContaining({ workEntryId: "entry-1" }),
    });
  });

  it("an approved work entry card is saved as confirmed work", async () => {
    const { service, workEntries } = modeSetup({ clients: [borkoClient] });
    await service.propose(owner, {
      type: "log_work_entry",
      title: "Pregled ugovora",
      minutes: 60,
    });

    await service.decide({
      workspaceId: "workspace-1",
      userId: "user-owner",
      actionId: "action-1",
      decision: "APPROVE",
    });

    // The linked case gives the client when no client is named.
    expect(workEntries.create).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1", caseId: "case-21" }),
      {},
    );
  });

  it("asks for the client of work when none can be found", async () => {
    const { service, prisma } = modeSetup({ linkedCase: false });
    const result = await service.propose(owner, {
      type: "log_work_entry",
      title: "Pregled ugovora",
      minutes: 60,
    });
    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("Za kog klijenta"),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("refuses work dated in the future", async () => {
    const { service } = modeSetup({ clients: [borkoClient] });
    const result = await service.propose(owner, {
      type: "log_work_entry",
      title: "Pregled ugovora",
      minutes: 60,
      date: nextYearDate(),
    });
    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("u budućnosti"),
    });
  });

  it("assigns a task to the named colleague", async () => {
    const { service, prisma } = modeSetup({ users: [marko], linkedCase: false });

    const result = await service.propose(owner, {
      type: "create_task",
      title: "Poslati ugovor",
      assignee: "Marko",
      dueDate: nextYearDate(),
    });

    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    expect(prisma.actions.get("action-1")!["payload"]).toEqual({
      title: "Poslati ugovor",
      assigneeUserId: "user-marko",
      priority: "NORMAL",
      dueDate: nextYearDate(),
    });
  });

  it("refuses an ambiguous assignee with the candidates", async () => {
    const { service } = modeSetup({
      users: [marko, { ...marko, id: "user-marko-2", lastName: "Ilić" }],
    });
    const result = await service.propose(owner, {
      type: "create_task",
      title: "Poslati ugovor",
      assignee: "Marko",
    });
    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("Marko Ilić (kolega)"),
    });
  });

  it("MANUAL mode opens the task form and saves it", async () => {
    const { service, work } = modeSetup({ permissionMode: "MANUAL", linkedCase: false });
    const result = await service.propose(owner, {
      type: "create_task",
      title: "Poslati ugovor",
    });
    expect(result).toMatchObject({ status: "FORM_REQUIRED" });

    const summary = await service.completeForm({
      workspaceId: "workspace-1",
      userId: "user-owner",
      actionId: "action-1",
      body: {
        title: "Poslati ugovor",
        assigneeUserId: "0b6c4f2e-6f1d-4c8e-9a51-2f0f0b7f3a11",
        priority: "NORMAL",
      },
    });

    expect(summary).toMatchObject({ status: "APPROVED", resultEntityType: "TASK" });
    expect(work.createTask).toHaveBeenCalled();
  });

  it("moves the only matching event to the new time and keeps its length", async () => {
    const { service, prisma } = modeSetup({ events: [upcoming()] });

    const result = await service.propose(owner, {
      type: "reschedule_event",
      participant: "Borko",
      newStartTime: "14:00",
    });

    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    const payload = prisma.actions.get("action-1")!["payload"] as Record<string, unknown>;
    expect(payload).toMatchObject({
      eventId: "event-7",
      title: "Sastanak sa Borkom",
      location: "Kancelarija",
      clientIds: ["client-borko"],
      assigneeUserIds: ["user-owner"],
    });
    const startsAt = new Date(String(payload["startsAt"]));
    expect(new Date(String(payload["endsAt"])).getTime() - startsAt.getTime()).toBe(3600_000);
    expect(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Belgrade",
        hour: "2-digit",
        minute: "2-digit",
      }).format(startsAt),
    ).toBe("14:00");
    // The conflict check leaves out the event being moved.
    expect(
      (prisma as unknown as Record<string, Record<string, jest.Mock>>)["event"].findMany.mock
        .calls[1][0].where,
    ).toMatchObject({ id: { not: "event-7" } });
  });

  it("asks which event when several match", async () => {
    const { service, prisma } = modeSetup({
      events: [upcoming(), upcoming({ id: "event-8", title: "Poziv sa Borkom" })],
    });
    const result = await service.propose(owner, {
      type: "cancel_event",
      participant: "Borko",
    });
    expect(result).toMatchObject({
      status: "INVALID",
      message: expect.stringContaining("Poziv sa Borkom – Borko Petrović"),
    });
    expect(prisma.actions.size).toBe(0);
  });

  it("AUTO mode asks instead when the new time overlaps", async () => {
    const { service, prisma, work } = modeSetup({
      permissionMode: "AUTO",
      events: [upcoming()],
      conflicts: [
        {
          title: "Ročište",
          startsAt: new Date("2030-01-01T13:00:00Z"),
          endsAt: new Date("2030-01-01T14:00:00Z"),
        },
      ],
    });
    const result = await service.propose(owner, {
      type: "reschedule_event",
      participant: "Borko",
      newStartTime: "14:00",
    });
    expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
    expect(prisma.actions.get("action-1")).toMatchObject({ mode: "CARD" });
    expect(work.updateEvent).not.toHaveBeenCalled();
  });

  it("cancelling an event is always a card", async () => {
    for (const permissionMode of ["AUTO", "MANUAL"] as const) {
      const { service, prisma, work } = modeSetup({
        permissionMode,
        events: [upcoming()],
      });
      const result = await service.propose(owner, {
        type: "cancel_event",
        participant: "Borko",
      });
      expect(result).toMatchObject({ status: "CONFIRMATION_REQUIRED" });
      expect(prisma.actions.get("action-1")).toMatchObject({ mode: "CARD" });
      expect(work.transitionEvent).not.toHaveBeenCalled();
    }
  });
});
