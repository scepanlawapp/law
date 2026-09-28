import { ConflictException, ForbiddenException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { FinancialsService } from "@law/financials";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";
const taskId = "55555555-5555-4555-a555-555555555555";
const eventId = "66666666-6666-4666-a666-666666666666";

function client() {
  return {
    id: clientId,
    clientNumber: "CL-000001",
    type: "ORGANIZATION",
    displayName: "Client One",
    status: "ACTIVE",
  };
}

function user() {
  return {
    id: userId,
    firstName: "Ana",
    lastName: "Advokat",
    email: "ana@example.test",
  };
}

function caseRecord() {
  return {
    id: caseId,
    workspaceId,
    clientId,
    caseNumber: "P-1/2026",
    name: "Client matter",
    status: "ACTIVE",
    priority: "NORMAL",
  };
}

function line(
  id: string,
  sourceType: string,
  sourceId: string,
  amount: number,
) {
  return {
    id,
    statementId: null,
    client: client(),
    caseLinks: [{ case: caseRecord() }],
    performedBy: user(),
    lineOrder: null,
    description: `${sourceType} work`,
    serviceDate: new Date("2026-09-23T10:00:00.000Z"),
    amount: { toString: () => amount.toFixed(2) },
    currency: "RSD",
    status: "UNBILLED",
    sourceType,
    sourceId,
    billedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  };
}

describe("FinancialsService", () => {
  const db = {
    client: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    billingStatementLine: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
      groupBy: jest.fn(),
    },
    billingSuggestionReview: {
      count: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    event: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    eventClient: { upsert: jest.fn() },
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    deadline: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
    },
    caseActivity: { findFirst: jest.fn(), findMany: jest.fn() },
    clientActivity: { findFirst: jest.fn(), findMany: jest.fn() },
    activityLog: { create: jest.fn() },
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
  const service = new FinancialsService(db as never);

  beforeEach(() => {
    jest.clearAllMocks();
    db.client.findFirst.mockResolvedValue(client());
    db.case.findFirst.mockResolvedValue(caseRecord());
    db.workspaceMember.findUnique.mockResolvedValue({
      status: "ACTIVE",
      user: user(),
    });
    db.billingStatementLine.findMany.mockResolvedValue([]);
    db.billingStatementLine.count.mockResolvedValue(0);
    db.billingSuggestionReview.findMany.mockResolvedValue([]);
    db.billingSuggestionReview.findUnique.mockResolvedValue(null);
    db.event.findMany.mockResolvedValue([]);
    db.task.findMany.mockResolvedValue([]);
    db.deadline.findMany.mockResolvedValue([]);
    db.caseActivity.findMany.mockResolvedValue([]);
    db.clientActivity.findMany.mockResolvedValue([]);
  });

  it("rejects ordinary members before exposing statement lines", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.MEMBER },
        () => service.listLines({} as never),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.billingStatementLine.findMany).not.toHaveBeenCalled();
  });

  it("keeps company catalog sources workspace-wide", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () =>
          service.createPriceSource({
            scope: "COMPANY_CATALOG",
            clientId,
            title: "Office catalog",
            rawText: "Consultation",
          } as never),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("applies client, case, source, and status filters to statement lines", async () => {
    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.listLines({
          page: 1,
          pageSize: 50,
          clientIds: [clientId],
          caseIds: [caseId],
          sourceTypes: ["EVENT", "TASK"],
          status: "UNBILLED",
        } as never),
    );

    expect(db.billingStatementLine.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: [clientId] },
          caseLinks: { some: { caseId: { in: [caseId] } } },
          sourceType: { in: ["EVENT", "TASK"] },
          status: "UNBILLED",
        }),
      }),
    );
  });

  it("rejects duplicate candidates before creating statement lines", async () => {
    const candidateKey = `TASK:${taskId}:${userId}`;

    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () =>
          service.recordCandidatesAsLines({
            clientId,
            items: [
              {
                candidateKey,
                description: "Task",
                amount: 100,
                currency: "RSD",
              },
              {
                candidateKey,
                description: "Task",
                amount: 100,
                currency: "RSD",
              },
            ],
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingStatementLine.create).not.toHaveBeenCalled();
  });

  it("lists every unbilled task and event and excludes other source types", async () => {
    db.event.findMany.mockResolvedValue([
      {
        id: eventId,
        title: "Future client meeting",
        status: "SCHEDULED",
        startsAt: new Date("2026-10-10T10:00:00.000Z"),
        billingStatementLineId: null,
        case: { ...caseRecord(), client: client() },
        clients: [],
        organizer: user(),
        assignees: [],
      },
    ]);
    db.task.findMany.mockResolvedValue([
      {
        id: taskId,
        title: "Draft submission",
        status: "TODO",
        completedAt: null,
        updatedAt: new Date("2026-09-29T10:00:00.000Z"),
        billingStatementLineId: null,
        case: { ...caseRecord(), client: client() },
        client: null,
        assignee: user(),
      },
    ]);

    const result = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.listCandidates({ page: 1, pageSize: 20 } as never),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        sourceType: "EVENT",
        client: expect.objectContaining({ id: clientId }),
      }),
      expect.objectContaining({ sourceType: "TASK" }),
    ]);
    expect(db.event.findMany.mock.calls[0][0].where).toEqual({
      workspaceId,
      billingStatementLineId: null,
    });
    expect(db.task.findMany.mock.calls[0][0].where).toEqual({
      workspaceId,
      billingStatementLineId: null,
    });
    expect(db.deadline.findMany).not.toHaveBeenCalled();
    expect(db.caseActivity.findMany).not.toHaveBeenCalled();
    expect(db.clientActivity.findMany).not.toHaveBeenCalled();
  });

  it("assigns a missing client to an event candidate and returns its new key", async () => {
    db.event.findFirst.mockResolvedValue({
      id: eventId,
      caseId: null,
      case: null,
    });

    const result = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.LAWYER },
      () =>
        service.assignCandidateClient(
          `EVENT:${eventId}:${userId}:UNASSIGNED`,
          clientId,
        ),
    );

    expect(result).toMatchObject({
      candidateKey: `EVENT:${eventId}:${userId}:${clientId}`,
      client: { id: clientId },
    });
    expect(db.eventClient.upsert).toHaveBeenCalledWith({
      where: { eventId_clientId: { eventId, clientId } },
      create: { workspaceId, eventId, clientId },
      update: {},
    });
    expect(db.activityLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "EVENT_CLIENT_ASSIGNED",
        entityId: eventId,
        clientId,
      }),
    });
  });

  it("cancels only an unbilled line and records the reason", async () => {
    db.billingStatementLine.findFirst.mockResolvedValue({
      id: "line-task",
      status: "UNBILLED",
    });
    db.billingStatementLine.update.mockResolvedValue({
      ...line("line-task", "TASK", taskId, 100),
      status: "CANCELLED",
      cancelledAt: new Date("2026-09-29T10:00:00.000Z"),
      cancellationReason: "Entered by mistake",
    });

    const result = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.LAWYER },
      () => service.cancelLine("line-task", "Entered by mistake"),
    );

    expect(result).toMatchObject({
      id: "line-task",
      status: "CANCELLED",
      cancellationReason: "Entered by mistake",
    });
    expect(db.billingStatementLine.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "line-task" },
        data: expect.objectContaining({
          status: "CANCELLED",
          cancellationReason: "Entered by mistake",
          cancelledByUserId: userId,
        }),
      }),
    );
  });

  it("creates one statement line per item and links each source", async () => {
    const taskKey = `TASK:${taskId}:${userId}`;
    const eventKey = `EVENT:${eventId}:${userId}:${clientId}`;
    db.task.findFirst.mockResolvedValue({
      id: taskId,
      clientId,
      caseId,
      case: caseRecord(),
      completedAt: new Date("2026-09-23T10:00:00.000Z"),
      updatedAt: new Date("2026-09-23T10:00:00.000Z"),
    });
    db.event.findFirst.mockResolvedValue({
      id: eventId,
      caseId,
      startsAt: new Date("2026-09-24T10:00:00.000Z"),
    });
    db.billingStatementLine.create
      .mockResolvedValueOnce(line("line-task", "TASK", taskId, 100))
      .mockResolvedValueOnce(line("line-event", "EVENT", eventId, 250));

    const result = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.recordCandidatesAsLines({
          clientId,
          items: [
            {
              candidateKey: taskKey,
              description: "Prepare submission",
              amount: 100,
              currency: "rsd",
            },
            {
              candidateKey: eventKey,
              description: "Client meeting",
              amount: 250,
              currency: "RSD",
            },
          ],
        }),
    );

    expect(result).toHaveLength(2);
    expect(db.billingStatementLine.create).toHaveBeenCalledTimes(2);
    expect(db.billingStatementLine.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          clientId,
          description: "Prepare submission",
          amount: 100,
          currency: "RSD",
          sourceType: "TASK",
          sourceId: taskId,
          caseLinks: { create: { workspaceId, caseId } },
        }),
      }),
    );
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { billingStatementLineId: "line-task" },
    });
    expect(db.event.update).toHaveBeenCalledWith({
      where: { id: eventId },
      data: { billingStatementLineId: "line-event" },
    });
    expect(db.billingSuggestionReview.upsert).toHaveBeenCalledTimes(2);
    expect(db.billingSuggestionReview.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          candidateKey: eventKey,
          resolution: "RECORDED",
          billingStatementLineId: "line-event",
        }),
      }),
    );
  });
});
