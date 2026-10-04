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
const invoiceId = "77777777-7777-4777-a777-777777777777";

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

function invoiceLine() {
  return {
    id: "88888888-8888-4888-a888-888888888888",
    invoiceId,
    client: client(),
    caseLinks: [{ case: caseRecord() }],
    performedBy: user(),
    lineOrder: 0,
    description: "Completed task",
    serviceDate: new Date("2026-09-23"),
    netAmount: new Prisma.Decimal(100),
    vatRate: new Prisma.Decimal(20),
    vatAmount: new Prisma.Decimal(20),
    grossAmount: new Prisma.Decimal(120),
    currency: "RSD",
    status: "RESERVED",
    sourceType: "TASK",
    sourceId: taskId,
    billedAt: null,
    cancelledAt: null,
    cancellationReason: null,
  };
}

function fullInvoice() {
  return {
    id: invoiceId,
    workspaceId,
    clientId,
    client: client(),
    invoiceNumber: "INV-000001",
    dateOfCreate: new Date("2026-09-01"),
    dateOfMaturity: new Date("2026-09-30"),
    dateOfTurnover: new Date("2026-09-15"),
    placeOfIssue: "Beograd",
    methodOfPayment: "Prenos na račun",
    comment: "",
    netAmount: new Prisma.Decimal(100),
    vatRate: new Prisma.Decimal(20),
    vatAmount: new Prisma.Decimal(20),
    grossAmount: new Prisma.Decimal(120),
    numberOfCashBill: "",
    country: "Srbija",
    currency: "RSD",
    status: "DRAFT",
    lines: [invoiceLine()],
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
    invoiceLine: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    invoice: {
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
    db.invoiceLine.deleteMany.mockResolvedValue({ count: 0 });
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
          invoiceId: null,
        }),
      }),
    );
    expect(db.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "DONE", invoiceId: null }),
      }),
    );
    expect(db.deadline.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "SATISFIED",
          invoiceId: null,
        }),
      }),
    );
  });

  it("creates invoice lines with the current user and links each source", async () => {
    const createdInvoice = {
      id: invoiceId,
      clientId,
      currency: "RSD",
    };
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.invoice.create.mockResolvedValue(createdInvoice);
    db.invoice.findUniqueOrThrow.mockResolvedValue(fullInvoice());
    db.task.findFirst.mockResolvedValue({
      id: taskId,
      clientId: null,
      caseId,
      case: caseRecord(),
    });

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.createInvoice({
          clientId,
          dateOfCreate: "2026-09-01",
          dateOfMaturity: "2026-09-30",
          dateOfTurnover: "2026-09-15",
          placeOfIssue: "Beograd",
          methodOfPayment: "Prenos na račun",
          comment: "",
          netAmount: 100,
          vatRate: 20,
          vatAmount: 20,
          grossAmount: 120,
          numberOfCashBill: "",
          country: "Srbija",
          currency: "RSD",
          lines: [
            {
              serviceDate: "2026-09-23",
              description: "Completed task",
              netAmount: 100,
              vatRate: 20,
              vatAmount: 20,
              grossAmount: 120,
              currency: "RSD",
              sourceType: "TASK",
              sourceId: taskId,
            },
          ],
        }),
    );

    expect(db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dateOfCreate: new Date("2026-09-01"),
        dateOfMaturity: new Date("2026-09-30"),
        dateOfTurnover: new Date("2026-09-15"),
        placeOfIssue: "Beograd",
        methodOfPayment: "Prenos na račun",
        netAmount: 100,
        vatRate: 20,
        vatAmount: 20,
        grossAmount: 120,
        country: "Srbija",
      }),
    });
    expect(db.invoiceLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId,
        clientId,
        performedByUserId: userId,
        netAmount: 100,
        vatRate: 20,
        vatAmount: 20,
        grossAmount: 120,
        status: "RESERVED",
        sourceType: "TASK",
        sourceId: taskId,
      }),
    });
    expect(db.task.update).toHaveBeenCalledWith({
      where: { id: taskId },
      data: { invoiceId },
    });
  });

  it("rejects a source already connected to another invoice", async () => {
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.invoice.create.mockResolvedValue({
      id: invoiceId,
      clientId,
      currency: "RSD",
    });
    db.task.findFirst.mockResolvedValue(null);

    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () =>
          service.createInvoice({
            clientId,
            dateOfCreate: "2026-09-01",
            dateOfMaturity: "2026-09-30",
            dateOfTurnover: "2026-09-15",
            placeOfIssue: "Beograd",
            methodOfPayment: "Prenos na račun",
            comment: "",
            netAmount: 100,
            vatRate: 20,
            vatAmount: 20,
            grossAmount: 120,
            numberOfCashBill: "",
            country: "Srbija",
            currency: "RSD",
            lines: [
              {
                serviceDate: "2026-09-23",
                description: "Task",
                netAmount: 100,
                vatRate: 20,
                vatAmount: 20,
                grossAmount: 120,
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

  it("updates invoice dates, metadata, and totals on a draft invoice", async () => {
    db.invoice.findFirst.mockResolvedValue(fullInvoice());
    db.invoice.update.mockResolvedValue(fullInvoice());

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.updateInvoice(invoiceId, {
          dateOfCreate: "2026-09-02",
          dateOfMaturity: "2026-10-02",
          dateOfTurnover: "2026-09-16",
          placeOfIssue: "Novi Sad",
          methodOfPayment: "Gotovina",
          comment: "Izmenjen komentar",
          netAmount: 200,
          vatRate: 10,
          vatAmount: 20,
          grossAmount: 220,
          numberOfCashBill: "GR-42",
          country: "Srbija",
        }),
    );

    expect(db.invoice.update).toHaveBeenCalledWith({
      where: { id: invoiceId },
      data: expect.objectContaining({
        dateOfCreate: new Date("2026-09-02"),
        dateOfMaturity: new Date("2026-10-02"),
        dateOfTurnover: new Date("2026-09-16"),
        placeOfIssue: "Novi Sad",
        methodOfPayment: "Gotovina",
        comment: "Izmenjen komentar",
        netAmount: 200,
        vatRate: 10,
        vatAmount: 20,
        grossAmount: 220,
        numberOfCashBill: "GR-42",
        country: "Srbija",
      }),
    });
  });

  it("deletes a draft invoice and relies on database cascades to release sources", async () => {
    db.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      status: "DRAFT",
    });

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.deleteInvoice(invoiceId),
    );

    expect(db.invoice.delete).toHaveBeenCalledWith({
      where: { id: invoiceId },
    });
    expect(db.financeMutationRequest.deleteMany).toHaveBeenCalledWith({
      where: {
        workspaceId,
        operation: "CREATE_INVOICE",
        resultEntityId: invoiceId,
      },
    });
  });

  it("refuses to delete a sent invoice", async () => {
    db.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      status: "SENT",
    });

    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.ADMIN },
        () => service.deleteInvoice(invoiceId),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.invoice.delete).not.toHaveBeenCalled();
  });
});
