import { ConflictException, ForbiddenException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { FinancialsService } from "@law/financials";
import { Prisma } from "@prisma/client";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";
const entryA = "55555555-5555-4555-a555-555555555555";
const entryB = "66666666-6666-4666-a666-666666666666";
const lineId = "88888888-8888-4888-a888-888888888888";
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
    id: lineId,
    statementId,
    client: client(),
    caseLinks: [{ case: caseRecord() }],
    performedBy: user(),
    lineOrder: 0,
    description: "Legal services",
    serviceDate: new Date("2026-09-23"),
    netAmount: new Prisma.Decimal(100),
    vatRate: new Prisma.Decimal(20),
    vatAmount: new Prisma.Decimal(20),
    grossAmount: new Prisma.Decimal(120),
    currency: "RSD",
    status: "RESERVED",
    sourceType: "WORK_ENTRY_GROUP",
    sourceId: null,
    pricingRequired: false,
    minutes: 90,
    workEntries: [
      {
        id: entryA,
        workDate: new Date("2026-09-23"),
        user: user(),
        description: "Call",
        minutes: 90,
      },
    ],
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
    lines: [statementLine()],
  };
}

describe("FinancialsService", () => {
  const db = {
    client: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    workEntry: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    activityLog: { createMany: jest.fn() },
    billingStatementLine: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    billingStatementLineCase: { createMany: jest.fn() },
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
    db.workEntry.findMany.mockResolvedValue([]);
    db.workEntry.updateMany.mockResolvedValue({ count: 0 });
    db.billingStatementLine.create.mockResolvedValue({ id: lineId });
    db.billingStatementLine.deleteMany.mockResolvedValue({ count: 0 });
    db.billingStatementLine.findMany.mockResolvedValue([]);
    db.financeMutationRequest.findUnique.mockResolvedValue(null);
  });

  const header = {
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
  };
  const line = (extra: Record<string, unknown> = {}) => ({
    serviceDate: "2026-09-23",
    description: "Legal services",
    netAmount: 100,
    vatRate: 20,
    vatAmount: 20,
    grossAmount: 120,
    currency: "RSD",
    ...extra,
  });
  const asAdmin = <T>(fn: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      fn,
    );

  function mockCreate() {
    db.domainCounter.upsert.mockResolvedValue({ value: 1 });
    db.billingStatement.create.mockResolvedValue({
      id: statementId,
      clientId,
      currency: "RSD",
    });
    db.billingStatement.findUniqueOrThrow.mockResolvedValue(fullStatement());
  }

  it("creates a statement and claims all line entries with one updateMany", async () => {
    mockCreate();
    db.workEntry.updateMany.mockResolvedValue({ count: 2 });
    db.workEntry.findMany
      .mockResolvedValueOnce([]) // release on empty statement
      .mockResolvedValueOnce([
        { id: entryA, clientId, caseId },
        { id: entryB, clientId, caseId },
      ]);

    await asAdmin(() =>
      service.createStatement({
        ...header,
        printWorkSpecification: false,
        lines: [line({ workEntryIds: [entryA, entryB], minutes: 120 })],
      }),
    );

    expect(db.billingStatement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dateOfCreate: new Date("2026-09-01"),
        netAmount: 100,
        printWorkSpecification: false,
      }),
    });
    expect(db.billingStatementLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        statementId,
        clientId,
        performedByUserId: userId,
        status: "RESERVED",
        sourceType: "WORK_ENTRY_GROUP",
        sourceId: null,
        minutes: 120,
        pricingRequired: false,
      }),
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [entryA, entryB] },
        workspaceId,
        clientId,
        status: "CONFIRMED",
        statementLineId: null,
      },
      data: {
        status: "BILLED",
        statementLineId: lineId,
        updatedByUserId: userId,
      },
    });
    expect(db.billingStatementLineCase.createMany).toHaveBeenCalledWith({
      data: [{ workspaceId, billingStatementLineId: lineId, caseId }],
      skipDuplicates: true,
    });
    expect(db.activityLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "WORK_ENTRY_BILLED",
          entityType: "WORK_ENTRY",
          entityId: entryA,
          actorUserId: userId,
          clientId,
          caseId,
        }),
        expect.objectContaining({ entityId: entryB }),
      ],
    });
  });

  it("creates manual lines without claiming entries", async () => {
    mockCreate();

    await asAdmin(() =>
      service.createStatement({
        ...header,
        lines: [line({ pricingRequired: true, netAmount: 0 })],
      }),
    );

    expect(db.billingStatementLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sourceType: null,
        sourceId: null,
        pricingRequired: true,
        minutes: null,
      }),
    });
    expect(db.workEntry.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a claim when an entry is unavailable", async () => {
    mockCreate();
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });

    await expect(
      asAdmin(() =>
        service.createStatement({
          ...header,
          lines: [line({ workEntryIds: [entryA, entryB] })],
        }),
      ),
    ).rejects.toThrow("Work entry is unavailable for the statement client");
  });

  it("rejects the same entry on two lines", async () => {
    mockCreate();

    await expect(
      asAdmin(() =>
        service.createStatement({
          ...header,
          lines: [
            line({ workEntryIds: [entryA] }),
            line({ workEntryIds: [entryA] }),
          ],
        }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.workEntry.updateMany).not.toHaveBeenCalled();
  });

  it("releases entries before replacing lines on update", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());
    db.billingStatement.update.mockResolvedValue(fullStatement());
    db.workEntry.findMany.mockResolvedValueOnce([
      { id: entryA, clientId, caseId, minutes: 90 },
      { id: entryB, clientId, caseId: null, minutes: null },
    ]);
    const order: string[] = [];
    db.workEntry.updateMany.mockImplementation(async () => {
      order.push("release");
      return { count: 1 };
    });
    db.billingStatementLine.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });

    await asAdmin(() =>
      service.updateStatement(statementId, { lines: [line()] }),
    );

    expect(order).toEqual(["release", "release", "delete"]);
    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [entryA] }, workspaceId },
      data: {
        status: "CONFIRMED",
        statementLineId: null,
        updatedByUserId: userId,
      },
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [entryB] }, workspaceId },
      data: {
        status: "PROPOSED",
        statementLineId: null,
        updatedByUserId: userId,
      },
    });
    expect(db.activityLog.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          action: "WORK_ENTRY_UNBILLED",
          entityId: entryA,
        }),
        expect.objectContaining({
          action: "WORK_ENTRY_UNBILLED",
          entityId: entryB,
          caseId: null,
        }),
      ],
    });
  });

  it("builds a draft from lines inside the caller transaction", async () => {
    mockCreate();
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: entryA, clientId, caseId }]);

    const id = await asAdmin(() =>
      service.createDraftFromLines(db as never, {
        clientId,
        currency: "RSD",
        billingMonth: "2026-09",
        header: {
          dateOfCreate: "2026-10-01",
          dateOfMaturity: "2026-10-31",
          dateOfTurnover: "2026-09-30",
          placeOfIssue: "Beograd",
          methodOfPayment: "Prenos na račun",
          country: "Srbija",
          vatRate: 20,
        },
        lines: [
          line({ workEntryIds: [entryA] }),
          line({ netAmount: 50, vatAmount: 10, grossAmount: 60 }),
        ],
      }),
    );

    expect(id).toBe(statementId);
    expect(db.billingStatement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingMonth: "2026-09",
        statementNumber: "ST-000001",
        netAmount: 150,
        vatAmount: 30,
        grossAmount: 180,
      }),
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledTimes(1);
  });

  it("updates invoice dates, metadata, and totals on a draft statement", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());
    db.billingStatement.update.mockResolvedValue(fullStatement());

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.updateStatement(statementId, {
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

    expect(db.billingStatement.update).toHaveBeenCalledWith({
      where: { id: statementId },
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

  it("deletes a draft statement and releases its entries first", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      id: statementId,
      status: "DRAFT",
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: 90 },
    ]);

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.deleteStatement(statementId),
    );

    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          statementLineId: null,
        }),
      }),
    );
    expect(db.workEntry.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.billingStatement.delete.mock.invocationCallOrder[0],
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

  it("voids a sent statement, releasing entries but keeping its lines", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      ...fullStatement(),
      status: "SENT",
    });
    db.billingStatement.update.mockResolvedValue(fullStatement());
    db.billingStatement.findUniqueOrThrow.mockResolvedValue({
      ...fullStatement(),
      status: "VOIDED",
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: 90 },
    ]);
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await asAdmin(() => service.voidStatement(statementId));

    expect(result.status).toBe("VOIDED");
    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          statementLineId: null,
        }),
      }),
    );
    expect(db.billingStatementLine.deleteMany).not.toHaveBeenCalled();
  });

  it("voids a draft statement, releasing entries then deleting lines", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());
    db.billingStatement.update.mockResolvedValue(fullStatement());
    db.billingStatement.findUniqueOrThrow.mockResolvedValue({
      ...fullStatement(),
      status: "VOIDED",
      lines: [],
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: null },
    ]);
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });

    await asAdmin(() => service.voidStatement(statementId));

    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROPOSED" }),
      }),
    );
    expect(db.billingStatementLine.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.workEntry.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.billingStatementLine.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it("refuses to send a statement with an unpriced line", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      ...fullStatement(),
      lines: [{ ...statementLine(), pricingRequired: true }],
    });

    await expect(
      asAdmin(() => service.sendStatement(statementId, {})),
    ).rejects.toThrow("Price every line before sending");
    expect(db.billingStatement.update).not.toHaveBeenCalled();
  });

  it("returns line work entries, minutes and statement flags", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      ...fullStatement(),
      printWorkSpecification: true,
      billingMonth: "2026-09",
    });

    const result = await asAdmin(() => service.getStatement(statementId));

    expect(result.printWorkSpecification).toBe(true);
    expect(result.billingMonth).toBe("2026-09");
    expect(result.lines[0]).toEqual(
      expect.objectContaining({
        pricingRequired: false,
        minutes: 90,
        workEntries: [
          {
            id: entryA,
            workDate: "2026-09-23",
            user: expect.objectContaining({ id: userId }),
            description: "Call",
            minutes: 90,
          },
        ],
      }),
    );
  });

  it("appends lines to a draft after the last line and adds to its totals", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());
    db.billingStatementLine.aggregate.mockResolvedValue({
      _max: { lineOrder: 2 },
    });
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany.mockResolvedValue([{ id: entryA, clientId, caseId }]);

    await asAdmin(() =>
      service.appendLinesToDraft(db as never, statementId, [
        line({ workEntryIds: [entryA], minutes: 60 }),
        line({ netAmount: 50.5, vatAmount: 10.1, grossAmount: 60.6 }),
      ]),
    );

    expect(db.billingStatementLine.create).toHaveBeenCalledTimes(2);
    expect(db.billingStatementLine.create.mock.calls[0][0].data).toMatchObject({
      statementId,
      lineOrder: 3,
      sourceType: "WORK_ENTRY_GROUP",
    });
    expect(db.billingStatementLine.create.mock.calls[1][0].data).toMatchObject({
      lineOrder: 4,
      sourceType: null,
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(db.billingStatementLineCase.createMany).toHaveBeenCalled();
    const { data } = db.billingStatement.update.mock.calls[0][0];
    expect(data.netAmount.increment.toString()).toBe("150.5");
    expect(data.vatAmount.increment.toString()).toBe("30.1");
    expect(data.grossAmount.increment.toString()).toBe("180.6");
  });

  it("refuses to append lines to a statement that is not a draft", async () => {
    db.billingStatement.findFirst.mockResolvedValue({
      ...fullStatement(),
      status: "SENT",
    });

    await expect(
      asAdmin(() =>
        service.appendLinesToDraft(db as never, statementId, [line()]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingStatementLine.create).not.toHaveBeenCalled();
  });

  it("refuses appended lines in another currency", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());

    await expect(
      asAdmin(() =>
        service.appendLinesToDraft(db as never, statementId, [
          line({ currency: "EUR" }),
        ]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingStatementLine.create).not.toHaveBeenCalled();
  });

  it("attaches entries to an existing draft line and refreshes its minutes", async () => {
    db.billingStatementLine.findFirst.mockResolvedValue({
      id: lineId,
      statement: fullStatement(),
    });
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany.mockResolvedValue([{ id: entryA, clientId, caseId }]);
    db.workEntry.aggregate.mockResolvedValue({ _sum: { minutes: 150 } });

    await asAdmin(() =>
      service.attachEntriesToLine(db as never, lineId, [entryA]),
    );

    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: { in: [entryA] },
        clientId,
        status: "CONFIRMED",
        statementLineId: null,
      }),
      data: expect.objectContaining({
        status: "BILLED",
        statementLineId: lineId,
      }),
    });
    expect(db.billingStatementLine.update).toHaveBeenCalledWith({
      where: { id: lineId },
      data: expect.objectContaining({
        minutes: 150,
        sourceType: "WORK_ENTRY_GROUP",
      }),
    });
  });

  it("refuses to attach entries to a line of a sent statement", async () => {
    db.billingStatementLine.findFirst.mockResolvedValue({
      id: lineId,
      statement: { ...fullStatement(), status: "SENT" },
    });

    await expect(
      asAdmin(() => service.attachEntriesToLine(db as never, lineId, [entryA])),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.workEntry.updateMany).not.toHaveBeenCalled();
  });

  it("stores the service-only source marker on an appended line", async () => {
    db.billingStatement.findFirst.mockResolvedValue(fullStatement());
    db.billingStatementLine.aggregate.mockResolvedValue({
      _max: { lineOrder: 0 },
    });
    db.billingStatement.update.mockResolvedValue({});

    await asAdmin(() =>
      service.appendLinesToDraft(db as never, statementId, [
        {
          ...line(),
          sourceType: "RETAINER_FEE",
          sourceId: "agreement-1",
        } as never,
      ]),
    );

    expect(db.billingStatementLine.create.mock.calls[0][0].data).toMatchObject({
      sourceType: "RETAINER_FEE",
      sourceId: "agreement-1",
    });
  });

  it("keeps the fee marker when entries are attached to a fee line", async () => {
    db.billingStatementLine.findFirst.mockResolvedValue({
      id: lineId,
      sourceType: "RETAINER_FEE",
      statement: fullStatement(),
    });
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany.mockResolvedValue([{ id: entryA, clientId, caseId }]);
    db.workEntry.aggregate.mockResolvedValue({ _sum: { minutes: 150 } });

    await asAdmin(() =>
      service.attachEntriesToLine(db as never, lineId, [entryA]),
    );

    expect(db.billingStatementLine.update).toHaveBeenCalledWith({
      where: { id: lineId },
      data: expect.objectContaining({ sourceType: "RETAINER_FEE" }),
    });
  });

  describe("fee marker survives composer edits by line identity", () => {
    const feeId = "99999999-9999-4999-a999-999999999999";
    const otherId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const foreignId = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";

    beforeEach(() => {
      db.billingStatement.findFirst.mockResolvedValue(fullStatement());
      db.billingStatement.update.mockResolvedValue(fullStatement());
      db.billingStatementLine.create
        .mockResolvedValueOnce({ id: "new-0" })
        .mockResolvedValueOnce({ id: "new-1" });
    });

    const createdData = (index: number) =>
      db.billingStatementLine.create.mock.calls[index][0].data;

    it("reads only this statement's marked lines, scoped to the workspace", async () => {
      db.billingStatementLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateStatement(statementId, { lines: [line()] }),
      );

      expect(db.billingStatementLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId,
            statementId,
            sourceType: "RETAINER_FEE",
          },
        }),
      );
    });

    it("keeps the marker when the entry-less fee line amount and description change", async () => {
      db.billingStatementLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateStatement(statementId, {
          lines: [
            line({ description: "Rad", netAmount: 50 }),
            line({
              id: feeId,
              description: "Pausalna naknada, korigovana",
              netAmount: 80,
            }),
          ],
        }),
      );

      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(0).sourceId).toBeNull();
      expect(createdData(1)).toMatchObject({
        description: "Pausalna naknada, korigovana",
        netAmount: 80,
        sourceType: "RETAINER_FEE",
        sourceId: "agreement-1",
      });
      expect(db.billingStatementLine.update).not.toHaveBeenCalled();
    });

    it("does not mark another line with the same net when the fee line is removed", async () => {
      db.billingStatementLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateStatement(statementId, {
          lines: [
            line({ id: otherId, netAmount: 100 }),
            line({ netAmount: 100 }),
          ],
        }),
      );

      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(1).sourceType).toBeNull();
      expect(createdData(0).sourceId).toBeNull();
      expect(createdData(1).sourceId).toBeNull();
    });

    it("ignores an id that does not belong to this statement", async () => {
      db.billingStatementLine.findMany.mockResolvedValue([]);

      await asAdmin(() =>
        service.updateStatement(statementId, {
          lines: [line({ id: foreignId }), line()],
        }),
      );

      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(0).sourceId).toBeNull();
      expect(createdData(1).sourceType).toBeNull();
    });

    it("never stores the client supplied id as the new line id", async () => {
      db.billingStatementLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateStatement(statementId, {
          lines: [line({ id: feeId })],
        }),
      );

      expect(createdData(0)).not.toHaveProperty("id");
    });

    it("creates a statement with or without line ids", async () => {
      mockCreate();

      await asAdmin(() =>
        service.createStatement({
          ...header,
          printWorkSpecification: false,
          lines: [line({ id: foreignId }), line()],
        }),
      );

      expect(db.billingStatementLine.create).toHaveBeenCalledTimes(2);
      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(1).sourceType).toBeNull();
    });
  });
});
