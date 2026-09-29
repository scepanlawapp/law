import { ConflictException, ForbiddenException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { FinancialsService } from "@law/financials";
import { Prisma } from "@prisma/client";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";
const taskId = "55555555-5555-4555-a555-555555555555";
const eventId = "66666666-6666-4666-a666-666666666666";
const statementId = "77777777-7777-4777-a777-777777777777";

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
    client: client(),
  };
}

function statementLine() {
  return {
    id: "88888888-8888-4888-a888-888888888888",
    statementId,
    client: client(),
    caseLinks: [{ case: caseRecord() }],
    performedBy: user(),
    lineOrder: 0,
    description: "Completed task",
    serviceDate: new Date("2026-09-23"),
    amount: new Prisma.Decimal(100),
    currency: "RSD",
    status: "RESERVED",
    sourceType: "TASK",
    sourceId: taskId,
    billedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  };
}

function fullStatement() {
  return {
    id: statementId,
    workspaceId,
    clientId,
    client: client(),
    statementNumber: "ST-000001",
    periodStart: new Date("2026-09-01"),
    periodEnd: new Date("2026-09-30"),
    currency: "RSD",
    status: "DRAFT",
    lines: [statementLine()],
    payments: [],
  };
}

describe("FinancialsService", () => {
  const db = {
    client: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    event: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    task: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    deadline: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    billingStatementLine: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    billingStatement: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    financeMutationRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
    },
    domainCounter: { upsert: jest.fn() },
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
  const service = new FinancialsService(db as never);

  beforeEach(() => {
    jest.clearAllMocks();
    db.client.findFirst.mockResolvedValue(client());
    db.event.findMany.mockResolvedValue([]);
    db.task.findMany.mockResolvedValue([]);
    db.deadline.findMany.mockResolvedValue([]);
    db.event.updateMany.mockResolvedValue({ count: 0 });
    db.task.updateMany.mockResolvedValue({ count: 0 });
    db.deadline.updateMany.mockResolvedValue({ count: 0 });
    db.billingStatementLine.deleteMany.mockResolvedValue({ count: 0 });
    db.financeMutationRequest.findUnique.mockResolvedValue(null);
  });

  it("rejects ordinary members before exposing billable work", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.MEMBER },
        () => service.listBillableWork({ page: 1, pageSize: 20 }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.task.findMany).not.toHaveBeenCalled();
  });

  it("lists only completed, unlinked work and applies source filters", async () => {
    db.event.findMany.mockResolvedValue([
      {
        id: eventId,
        caseId,
        title: "Completed hearing",
        startsAt: new Date("2026-09-24T10:00:00.000Z"),
        case: caseRecord(),
        clients: [],
        organizer: user(),
        assignees: [],
      },
    ]);
    db.task.findMany.mockResolvedValue([
      {
        id: taskId,
        caseId,
        clientId: null,
        title: "Completed task",
        completedAt: new Date("2026-09-23T10:00:00.000Z"),
        updatedAt: new Date("2026-09-23T10:00:00.000Z"),
        case: caseRecord(),
        client: null,
        assignee: user(),
      },
    ]);

    const result = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.listBillableWork({
          clientId,
          sourceTypes: ["TASK"],
          page: 1,
          pageSize: 20,
        }),
    );

    expect(result.items).toEqual([
      expect.objectContaining({
        sourceKey: `TASK:${taskId}`,
        sourceType: "TASK",
        client: expect.objectContaining({ id: clientId }),
      }),
    ]);
    expect(db.event.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "COMPLETED",
          statementId: null,
        }),
      }),
    );
    expect(db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "DONE", statementId: null }),
      }),
    );
    expect(db.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "SATISFIED",
          statementId: null,
        }),
      }),
    );
  });

  it("creates statement lines with the current user and links each source", async () => {
    const createdStatement = {
      id: statementId,
      clientId,
      currency: "RSD",
    };
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.billingStatement.create.mockResolvedValue(createdStatement);
    db.billingStatement.findUniqueOrThrow.mockResolvedValue(fullStatement());
    db.task.findFirst.mockResolvedValue({
      id: taskId,
      clientId: null,
      caseId,
      case: caseRecord(),
    });

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.createStatement({
          clientId,
          periodStart: "2026-09-01",
          periodEnd: "2026-09-30",
          currency: "RSD",
          lines: [
            {
              serviceDate: "2026-09-23",
              description: "Completed task",
              amount: 100,
              currency: "RSD",
              sourceType: "TASK",
              sourceId: taskId,
            },
          ],
        }),
    );

    expect(db.billingStatementLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statementId,
        clientId,
        performedByUserId: userId,
        status: "RESERVED",
        sourceType: "TASK",
        sourceId: taskId,
      }),
    });
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { statementId },
    });
  });

  it("rejects a source already connected to another statement", async () => {
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.billingStatement.create.mockResolvedValue({
      id: statementId,
      clientId,
      currency: "RSD",
    });
    db.task.findFirst.mockResolvedValue(null);

    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () =>
          service.createStatement({
            clientId,
            periodStart: "2026-09-01",
            periodEnd: "2026-09-30",
            currency: "RSD",
            lines: [
              {
                serviceDate: "2026-09-23",
                description: "Task",
                amount: 100,
                currency: "RSD",
                sourceType: "TASK",
                sourceId: taskId,
              },
            ],
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.task.update).not.toHaveBeenCalled();
  });

  it("deletes a draft statement and relies on database cascades to release sources", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      id: statementId,
      status: "DRAFT",
    });

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.deleteStatement(statementId),
    );

    expect(db.billingStatement.delete).toHaveBeenCalledWith({
      where: { id: statementId },
    });
    expect(db.financeMutationRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        operation: "CREATE_STATEMENT",
        resultEntityId: statementId,
      },
    });
  });

  it("refuses to delete a sent statement", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      id: statementId,
      status: "SENT",
    });

    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () => service.deleteStatement(statementId),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingStatement.delete).not.toHaveBeenCalled();
  });
});
