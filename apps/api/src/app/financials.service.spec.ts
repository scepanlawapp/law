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
    id: lineId,
    invoiceId,
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
    workEntry: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    activityLog: { createMany: jest.fn() },
    invoiceLine: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
      findFirst: jest.fn(),
      aggregate: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    invoiceLineCase: { createMany: jest.fn() },
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
    db.workEntry.findMany.mockResolvedValue([]);
    db.workEntry.updateMany.mockResolvedValue({ count: 0 });
    db.invoiceLine.create.mockResolvedValue({ id: lineId });
    db.invoiceLine.deleteMany.mockResolvedValue({ count: 0 });
    db.invoiceLine.findMany.mockResolvedValue([]);
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
    db.invoice.create.mockResolvedValue({
      id: invoiceId,
      clientId,
      currency: "RSD",
    });
    db.invoice.findUniqueOrThrow.mockResolvedValue(fullInvoice());
  }

  it("creates a invoice and claims all line entries with one updateMany", async () => {
    mockCreate();
    db.workEntry.updateMany.mockResolvedValue({ count: 2 });
    db.workEntry.findMany
      .mockResolvedValueOnce([]) // release on empty invoice
      .mockResolvedValueOnce([
        { id: entryA, clientId, caseId },
        { id: entryB, clientId, caseId },
      ]);

    await asAdmin(() =>
      service.createInvoice({
        ...header,
        printWorkSpecification: false,
        lines: [line({ workEntryIds: [entryA, entryB], minutes: 120 })],
      }),
    );

    expect(db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        dateOfCreate: new Date("2026-09-01"),
        netAmount: 100,
        printWorkSpecification: false,
      }),
    });
    expect(db.invoiceLine.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        invoiceId,
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
        invoiceLineId: null,
      },
      data: {
        status: "BILLED",
        invoiceLineId: lineId,
        updatedByUserId: userId,
      },
    });
    expect(db.invoiceLineCase.createMany).toHaveBeenCalledWith({
      data: [{ workspaceId, invoiceLineId: lineId, caseId }],
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
      service.createInvoice({
        ...header,
        lines: [line({ pricingRequired: true, netAmount: 0 })],
      }),
    );

    expect(db.invoiceLine.create).toHaveBeenCalledWith({
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
        service.createInvoice({
          ...header,
          lines: [line({ workEntryIds: [entryA, entryB] })],
        }),
      ),
    ).rejects.toThrow("Work entry is unavailable for the invoice client");
  });

  it("rejects the same entry on two lines", async () => {
    mockCreate();

    await expect(
      asAdmin(() =>
        service.createInvoice({
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
    db.invoice.findFirst.mockResolvedValue(fullInvoice());
    db.invoice.update.mockResolvedValue(fullInvoice());
    db.workEntry.findMany.mockResolvedValueOnce([
      { id: entryA, clientId, caseId, minutes: 90 },
      { id: entryB, clientId, caseId: null, minutes: null },
    ]);
    const order: string[] = [];
    db.workEntry.updateMany.mockImplementation(async () => {
      order.push("release");
      return { count: 1 };
    });
    db.invoiceLine.deleteMany.mockImplementation(async () => {
      order.push("delete");
      return { count: 1 };
    });

    await asAdmin(() => service.updateInvoice(invoiceId, { lines: [line()] }));

    expect(order).toEqual(["release", "release", "delete"]);
    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [entryA] }, workspaceId },
      data: {
        status: "CONFIRMED",
        invoiceLineId: null,
        updatedByUserId: userId,
      },
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [entryB] }, workspaceId },
      data: {
        status: "PROPOSED",
        invoiceLineId: null,
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

    expect(id).toBe(invoiceId);
    expect(db.invoice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        billingMonth: "2026-09",
        invoiceNumber: "INV-000001",
        netAmount: 150,
        vatAmount: 30,
        grossAmount: 180,
      }),
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledTimes(1);
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

  it("deletes a draft invoice and releases its entries first", async () => {
    db.invoice.findFirst.mockResolvedValue({
      id: invoiceId,
      status: "DRAFT",
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: 90 },
    ]);

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.deleteInvoice(invoiceId),
    );

    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          invoiceLineId: null,
        }),
      }),
    );
    expect(db.workEntry.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.invoice.delete.mock.invocationCallOrder[0],
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

  it("voids a sent invoice, releasing entries but keeping its lines", async () => {
    db.invoice.findFirst.mockResolvedValue({
      ...fullInvoice(),
      status: "SENT",
    });
    db.invoice.update.mockResolvedValue(fullInvoice());
    db.invoice.findUniqueOrThrow.mockResolvedValue({
      ...fullInvoice(),
      status: "VOIDED",
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: 90 },
    ]);
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });

    const result = await asAdmin(() => service.voidInvoice(invoiceId));

    expect(result.status).toBe("VOIDED");
    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CONFIRMED",
          invoiceLineId: null,
        }),
      }),
    );
    expect(db.invoiceLine.deleteMany).not.toHaveBeenCalled();
  });

  it("voids a draft invoice, releasing entries then deleting lines", async () => {
    db.invoice.findFirst.mockResolvedValue(fullInvoice());
    db.invoice.update.mockResolvedValue(fullInvoice());
    db.invoice.findUniqueOrThrow.mockResolvedValue({
      ...fullInvoice(),
      status: "VOIDED",
      lines: [],
    });
    db.workEntry.findMany.mockResolvedValue([
      { id: entryA, clientId, caseId, minutes: null },
    ]);
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });

    await asAdmin(() => service.voidInvoice(invoiceId));

    expect(db.workEntry.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "PROPOSED" }),
      }),
    );
    expect(db.invoiceLine.deleteMany).toHaveBeenCalledTimes(1);
    expect(db.workEntry.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      db.invoiceLine.deleteMany.mock.invocationCallOrder[0],
    );
  });

  it("refuses to send a invoice with an unpriced line", async () => {
    db.invoice.findFirst.mockResolvedValue({
      ...fullInvoice(),
      lines: [{ ...invoiceLine(), pricingRequired: true }],
    });

    await expect(
      asAdmin(() => service.sendInvoice(invoiceId, {})),
    ).rejects.toThrow("Price every line before sending");
    expect(db.invoice.update).not.toHaveBeenCalled();
  });

  it("returns line work entries, minutes and invoice flags", async () => {
    db.invoice.findFirst.mockResolvedValue({
      ...fullInvoice(),
      printWorkSpecification: true,
      billingMonth: "2026-09",
    });

    const result = await asAdmin(() => service.getInvoice(invoiceId));

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
    db.invoice.findFirst.mockResolvedValue(fullInvoice());
    db.invoiceLine.aggregate.mockResolvedValue({
      _max: { lineOrder: 2 },
    });
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany.mockResolvedValue([{ id: entryA, clientId, caseId }]);

    await asAdmin(() =>
      service.appendLinesToDraft(db as never, invoiceId, [
        line({ workEntryIds: [entryA], minutes: 60 }),
        line({ netAmount: 50.5, vatAmount: 10.1, grossAmount: 60.6 }),
      ]),
    );

    expect(db.invoiceLine.create).toHaveBeenCalledTimes(2);
    expect(db.invoiceLine.create.mock.calls[0][0].data).toMatchObject({
      invoiceId,
      lineOrder: 3,
      sourceType: "WORK_ENTRY_GROUP",
    });
    expect(db.invoiceLine.create.mock.calls[1][0].data).toMatchObject({
      lineOrder: 4,
      sourceType: null,
    });
    expect(db.workEntry.updateMany).toHaveBeenCalledTimes(1);
    expect(db.invoiceLineCase.createMany).toHaveBeenCalled();
    const { data } = db.invoice.update.mock.calls[0][0];
    expect(data.netAmount.increment.toString()).toBe("150.5");
    expect(data.vatAmount.increment.toString()).toBe("30.1");
    expect(data.grossAmount.increment.toString()).toBe("180.6");
  });

  it("refuses to append lines to a invoice that is not a draft", async () => {
    db.invoice.findFirst.mockResolvedValue({
      ...fullInvoice(),
      status: "SENT",
    });

    await expect(
      asAdmin(() =>
        service.appendLinesToDraft(db as never, invoiceId, [line()]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.invoiceLine.create).not.toHaveBeenCalled();
  });

  it("refuses appended lines in another currency", async () => {
    db.invoice.findFirst.mockResolvedValue(fullInvoice());

    await expect(
      asAdmin(() =>
        service.appendLinesToDraft(db as never, invoiceId, [
          line({ currency: "EUR" }),
        ]),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.invoiceLine.create).not.toHaveBeenCalled();
  });

  it("attaches entries to an existing draft line and refreshes its minutes", async () => {
    db.invoiceLine.findFirst.mockResolvedValue({
      id: lineId,
      invoice: fullInvoice(),
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
        invoiceLineId: null,
      }),
      data: expect.objectContaining({
        status: "BILLED",
        invoiceLineId: lineId,
      }),
    });
    expect(db.invoiceLine.update).toHaveBeenCalledWith({
      where: { id: lineId },
      data: expect.objectContaining({
        minutes: 150,
        sourceType: "WORK_ENTRY_GROUP",
      }),
    });
  });

  it("refuses to attach entries to a line of a sent invoice", async () => {
    db.invoiceLine.findFirst.mockResolvedValue({
      id: lineId,
      invoice: { ...fullInvoice(), status: "SENT" },
    });

    await expect(
      asAdmin(() => service.attachEntriesToLine(db as never, lineId, [entryA])),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.workEntry.updateMany).not.toHaveBeenCalled();
  });

  it("stores the service-only source marker on an appended line", async () => {
    db.invoice.findFirst.mockResolvedValue(fullInvoice());
    db.invoiceLine.aggregate.mockResolvedValue({
      _max: { lineOrder: 0 },
    });
    db.invoice.update.mockResolvedValue({});

    await asAdmin(() =>
      service.appendLinesToDraft(db as never, invoiceId, [
        {
          ...line(),
          sourceType: "RETAINER_FEE",
          sourceId: "agreement-1",
        } as never,
      ]),
    );

    expect(db.invoiceLine.create.mock.calls[0][0].data).toMatchObject({
      sourceType: "RETAINER_FEE",
      sourceId: "agreement-1",
    });
  });

  it("keeps the fee marker when entries are attached to a fee line", async () => {
    db.invoiceLine.findFirst.mockResolvedValue({
      id: lineId,
      sourceType: "RETAINER_FEE",
      invoice: fullInvoice(),
    });
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.findMany.mockResolvedValue([{ id: entryA, clientId, caseId }]);
    db.workEntry.aggregate.mockResolvedValue({ _sum: { minutes: 150 } });

    await asAdmin(() =>
      service.attachEntriesToLine(db as never, lineId, [entryA]),
    );

    expect(db.invoiceLine.update).toHaveBeenCalledWith({
      where: { id: lineId },
      data: expect.objectContaining({ sourceType: "RETAINER_FEE" }),
    });
  });

  describe("fee marker survives composer edits by line identity", () => {
    const feeId = "99999999-9999-4999-a999-999999999999";
    const otherId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const foreignId = "bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb";

    beforeEach(() => {
      db.invoice.findFirst.mockResolvedValue(fullInvoice());
      db.invoice.update.mockResolvedValue(fullInvoice());
      db.invoiceLine.create
        .mockResolvedValueOnce({ id: "new-0" })
        .mockResolvedValueOnce({ id: "new-1" });
    });

    const createdData = (index: number) =>
      db.invoiceLine.create.mock.calls[index][0].data;

    it("reads only this invoice's marked lines, scoped to the workspace", async () => {
      db.invoiceLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateInvoice(invoiceId, { lines: [line()] }),
      );

      expect(db.invoiceLine.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId,
            invoiceId,
            sourceType: "RETAINER_FEE",
          },
        }),
      );
    });

    it("keeps the marker when the entry-less fee line amount and description change", async () => {
      db.invoiceLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateInvoice(invoiceId, {
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
      expect(db.invoiceLine.update).not.toHaveBeenCalled();
    });

    it("does not mark another line with the same net when the fee line is removed", async () => {
      db.invoiceLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateInvoice(invoiceId, {
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

    it("ignores an id that does not belong to this invoice", async () => {
      db.invoiceLine.findMany.mockResolvedValue([]);

      await asAdmin(() =>
        service.updateInvoice(invoiceId, {
          lines: [line({ id: foreignId }), line()],
        }),
      );

      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(0).sourceId).toBeNull();
      expect(createdData(1).sourceType).toBeNull();
    });

    it("never stores the client supplied id as the new line id", async () => {
      db.invoiceLine.findMany.mockResolvedValue([
        { id: feeId, sourceId: "agreement-1" },
      ]);

      await asAdmin(() =>
        service.updateInvoice(invoiceId, {
          lines: [line({ id: feeId })],
        }),
      );

      expect(createdData(0)).not.toHaveProperty("id");
    });

    it("creates a invoice with or without line ids", async () => {
      mockCreate();

      await asAdmin(() =>
        service.createInvoice({
          ...header,
          printWorkSpecification: false,
          lines: [line({ id: foreignId }), line()],
        }),
      );

      expect(db.invoiceLine.create).toHaveBeenCalledTimes(2);
      expect(createdData(0).sourceType).toBeNull();
      expect(createdData(1).sourceType).toBeNull();
    });
  });
});
