import { PrismaClient, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import {
  PaymentsService,
  collectionBalance,
} from "../../../../libs/api/features/financials/src/lib/payments.service";
import { SavePaymentDto } from "../../../../libs/api/features/financials/src/lib/payments.dto";
import { FinancialsService } from "@law/financials";

// Always use a separately migrated disposable database; never the application's DATABASE_URL.
const url = process.env.PAYMENTS_TEST_DATABASE_URL;
const integration = url ? describe : describe.skip;
describe("collection decimals", () => {
  it("uses exact amounts and keeps overdue separate from collection state", () => {
    expect(
      collectionBalance(
        new Prisma.Decimal("0.30"),
        new Prisma.Decimal("0.10").plus("0.20"),
        "SENT",
        "2026-01-01",
        "2026-02-01",
      ),
    ).toMatchObject({
      paidAmount: "0.30",
      remainingAmount: "0.00",
      collectionStatus: "PAID",
      overdue: false,
    });
    expect(
      collectionBalance(
        new Prisma.Decimal("100"),
        new Prisma.Decimal("30"),
        "SENT",
        "2026-01-01",
        "2026-01-03",
      ),
    ).toMatchObject({
      remainingAmount: "70.00",
      collectionStatus: "PARTIALLY_PAID",
      overdue: true,
      daysOverdue: 2,
    });
  });
});
integration("payments PostgreSQL transactions", () => {
  let db: PrismaClient;
  let service: PaymentsService;
  let workspaceId: string;
  let foreignWorkspace: string;
  let userId: string;
  let clientId: string;
  let foreignClient: string;
  let invoiceId: string;
  let invoiceB: string;
  let draftId: string;
  let voidedId: string;
  let eurId: string;
  let foreignInvoice: string;
  const asAdmin = <T>(fn: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      fn,
    );
  const request = (extra: Partial<SavePaymentDto> = {}): SavePaymentDto => ({
    amount: "100.00",
    currency: "RSD",
    receivedAt: "2026-01-10",
    paymentMethod: "BANK_TRANSFER",
    purpose: "REGULAR",
    clientId,
    allocations: [],
    ...extra,
  });
  const create = (body: SavePaymentDto, key = randomUUID()) =>
    asAdmin(() => service.save(null, body, key));
  const invoice = async (
    status: "DRAFT" | "SENT" | "VOIDED",
    currency = "RSD",
    client = clientId,
    workspace = workspaceId,
  ) =>
    db.invoice.create({
      data: {
        workspaceId: workspace,
        clientId: client,
        invoiceNumber: randomUUID(),
        dateOfCreate: new Date("2026-01-01"),
        dateOfMaturity: new Date("2026-01-05"),
        dateOfTurnover: new Date("2026-01-01"),
        placeOfIssue: "Beograd",
        methodOfPayment: "BANK_TRANSFER",
        comment: "",
        netAmount: 100,
        vatRate: 0,
        vatAmount: 0,
        grossAmount: 100,
        numberOfCashBill: "",
        country: "RS",
        currency,
        status,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
    });
  beforeAll(async () => {
    if (!url?.includes("payment_collection_test"))
      throw new Error("Use a dedicated payment_collection_test database");
    db = new PrismaClient({ datasourceUrl: url });
    service = new PaymentsService(db as never);
    workspaceId = (
      await db.workspace.create({ data: { name: "Payment test" } })
    ).id;
    foreignWorkspace = (
      await db.workspace.create({ data: { name: "Isolation test" } })
    ).id;
    userId = (
      await db.user.create({ data: { email: `${randomUUID()}@payment.test` } })
    ).id;
    clientId = (
      await db.client.create({
        data: {
          workspaceId,
          clientNumber: randomUUID(),
          type: "INDIVIDUAL",
          displayName: "Test klijent",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      })
    ).id;
    foreignClient = (
      await db.client.create({
        data: {
          workspaceId: foreignWorkspace,
          clientNumber: randomUUID(),
          type: "INDIVIDUAL",
          displayName: "Drugi klijent",
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      })
    ).id;
    await db.organizationSettings.create({
      data: {
        workspaceId,
        allowedCurrencyCodes: ["RSD", "EUR"],
        availableVatRates: [20],
        allowedSefAttachmentFileExtensions: [],
      },
    });
  }, 30000);
  beforeEach(async () => {
    invoiceId = (await invoice("SENT")).id;
    invoiceB = (await invoice("SENT")).id;
    draftId = (await invoice("DRAFT")).id;
    voidedId = (await invoice("VOIDED")).id;
    eurId = (await invoice("SENT", "EUR")).id;
    foreignInvoice = (
      await invoice("SENT", "RSD", foreignClient, foreignWorkspace)
    ).id;
  });
  afterAll(async () => {
    if (!db) return;
    const where = { workspaceId: { in: [workspaceId, foreignWorkspace] } };
    await db.paymentAuditEvent.deleteMany({ where });
    await db.paymentAllocation.deleteMany({ where });
    await db.payment.deleteMany({ where });
    await db.financeMutationRequest.deleteMany({ where });
    await db.invoice.deleteMany({ where });
    await db.bankAccount.deleteMany({ where });
    await db.client.deleteMany({ where });
    await db.organizationSettings.deleteMany({ where });
    await db.workspace.deleteMany({
      where: { id: { in: [workspaceId, foreignWorkspace] } },
    });
    await db.user.delete({ where: { id: userId } });
    await db.$disconnect();
  });
  it("records unidentified receipts and advances without allocations", async () => {
    const p = await create(
      request({ clientId: null, payerName: "Treće lice", purpose: "ADVANCE" }),
    );
    expect(p.unallocatedAmount).toBe("100.00");
    expect(p.allocatedAmount).toBe("0.00");
    expect(p.auditEvents).toHaveLength(1);
    const edited = await asAdmin(() =>
      service.save(
        p.id,
        request({
          version: p.version,
          purpose: "ADVANCE",
          allocations: [{ invoiceId, amount: "20.00" }],
        }),
        randomUUID(),
      ),
    );
    expect(edited.unallocatedAmount).toBe("80.00");
  });
  it("allocates one receipt across invoices and multiple receipts to one invoice", async () => {
    const a = await create(
      request({
        allocations: [
          { invoiceId, amount: "30.10" },
          { invoiceId: invoiceB, amount: "20.20" },
        ],
      }),
    );
    expect(a.unallocatedAmount).toBe("49.70");
    await create(request({ allocations: [{ invoiceId, amount: "69.90" }] }));
    const i = await asAdmin(() => service.collection(invoiceId));
    expect(i.paidAmount).toBe("100.00");
    expect(i.collectionStatus).toBe("PAID");
    expect(i.overdue).toBe(false);
  });
  it("edits/removes allocations atomically, restores balances and retains history", async () => {
    const p = await create(
      request({ allocations: [{ invoiceId, amount: "100" }] }),
    );
    await expect(
      asAdmin(() =>
        service.save(
          p.id,
          request({
            version: p.version,
            amount: "70",
            allocations: [{ invoiceId, amount: "90" }],
          }),
          randomUUID(),
        ),
      ),
    ).rejects.toThrow("premašuje");
    expect(
      (await asAdmin(() => service.collection(invoiceId))).paidAmount,
    ).toBe("100.00");
    const edited = await asAdmin(() =>
      service.save(
        p.id,
        request({
          version: p.version,
          amount: "70",
          allocations: [{ invoiceId, amount: "50" }],
        }),
        randomUUID(),
      ),
    );
    expect(edited.unallocatedAmount).toBe("20.00");
    expect(edited.allocations).toHaveLength(2);
    const removed = await asAdmin(() =>
      service.save(
        p.id,
        request({ version: edited.version, allocations: [] }),
        randomUUID(),
      ),
    );
    expect(removed.unallocatedAmount).toBe("100.00");
    expect(
      (await asAdmin(() => service.collection(invoiceId))).collectionStatus,
    ).toBe("UNPAID");
    expect(removed.auditEvents).toHaveLength(3);
  });
  it("voids payments with history and refuses invoice voiding with active allocations", async () => {
    const p = await create(
      request({
        allocations: [
          { invoiceId, amount: "60" },
          { invoiceId: invoiceB, amount: "40" },
        ],
      }),
    );
    const finance = new FinancialsService(
      db as never,
      {} as never,
      {
        lockInvoice: async (tx: Prisma.TransactionClient, id: string) => {
          await tx.$queryRaw`SELECT id FROM "Invoice" WHERE id=${id} FOR UPDATE`;
        },
        assertMutable: async () => undefined,
      } as never,
    );
    await expect(asAdmin(() => finance.voidInvoice(invoiceId))).rejects.toThrow(
      "raspodele",
    );
    await expect(
      asAdmin(() =>
        service.void(p.id, { reason: " ", version: p.version }, randomUUID()),
      ),
    ).rejects.toThrow("razlog");
    const voided = await asAdmin(() =>
      service.void(
        p.id,
        { reason: "Pogrešan unos", version: p.version },
        randomUUID(),
      ),
    );
    expect(voided.status).toBe("VOIDED");
    expect(voided.allocations).toHaveLength(2);
    expect(voided.unallocatedAmount).toBe("0.00");
    expect(
      (await asAdmin(() => service.collection(invoiceId))).paidAmount,
    ).toBe("0.00");
  });
  it.each(["draft", "voided", "currency", "foreign", "unidentified"] as const)(
    "rejects invalid allocation: %s",
    async (type) => {
      const id = {
        draft: draftId,
        voided: voidedId,
        currency: eurId,
        foreign: foreignInvoice,
        unidentified: invoiceId,
      }[type];
      await expect(
        create(
          request({
            clientId: type === "unidentified" ? null : clientId,
            allocations: [{ invoiceId: id, amount: "10" }],
          }),
        ),
      ).rejects.toThrow();
    },
  );
  it("enforces workspace/permission isolation and precise monetary validation", async () => {
    await expect(create(request({ clientId: foreignClient }))).rejects.toThrow(
      "Klijent",
    );
    const bank = await db.bankAccount.create({
      data: {
        workspaceId: foreignWorkspace,
        name: "Foreign",
        currencyCode: "RSD",
      },
    });
    await expect(create(request({ bankAccountId: bank.id }))).rejects.toThrow(
      "Bankovni",
    );
    const p = await create(request());
    await expect(
      WorkspaceContextService.run(
        { workspaceId: foreignWorkspace, userId, role: WorkspaceRole.ADMIN },
        () => service.detail(p.id),
      ),
    ).rejects.toThrow("pronađena");
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.LAWYER },
        () => service.list({ page: 1, pageSize: 25 }),
      ),
    ).rejects.toThrow("dozvoljen");
    for (const amount of ["0", "-1", "1.001", "NaN"])
      await expect(create(request({ amount }))).rejects.toThrow("Iznos");
    await expect(
      create(
        request({ allocations: [{ invoiceId, amount: "101" }], amount: "200" }),
      ),
    ).rejects.toThrow("dug");
  });
  it("deduplicates simultaneous retries and rejects a reused key with different data", async () => {
    const key = randomUUID();
    const [a, b] = await Promise.all([
      create(request(), key),
      create(request(), key),
    ]);
    expect(a.id).toBe(b.id);
    expect(await db.payment.count({ where: { id: a.id } })).toBe(1);
    await expect(create(request({ amount: "99" }), key)).rejects.toThrow(
      "ključ".replace("k", "K"),
    );
  });
  it("serializes competing invoice allocations and rejects stale payment updates", async () => {
    const results = await Promise.allSettled([
      create(request({ allocations: [{ invoiceId, amount: "70" }] })),
      create(request({ allocations: [{ invoiceId, amount: "70" }] })),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      (await asAdmin(() => service.collection(invoiceId))).paidAmount,
    ).toBe("70.00");
    const p = await create(request());
    const updates = await Promise.allSettled([
      asAdmin(() =>
        service.save(
          p.id,
          request({
            version: p.version,
            allocations: [{ invoiceId: invoiceB, amount: "60" }],
          }),
          randomUUID(),
        ),
      ),
      asAdmin(() =>
        service.save(
          p.id,
          request({
            version: p.version,
            allocations: [{ invoiceId: invoiceB, amount: "70" }],
          }),
          randomUUID(),
        ),
      ),
    ]);
    expect(updates.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });
  it("filters and paginates on the server and separates summary currencies/date scopes", async () => {
    const marker = randomUUID();
    await create(
      request({ reference: marker, amount: "11.11", purpose: "ADVANCE" }),
    );
    await create(
      request({
        reference: marker,
        amount: "22.22",
        currency: "EUR",
        receivedAt: "2026-02-01",
      }),
    );
    const page = await asAdmin(() =>
      service.list({
        search: marker,
        page: 1,
        pageSize: 1,
        sort: "amount",
        direction: "asc",
        allocationState: "UNALLOCATED",
        status: "ACTIVE",
      }),
    );
    expect(page.meta.totalItems).toBe(2);
    expect(page.items[0].amount).toBe("11.11");
    const summary = await asAdmin(() =>
      service.summary({
        page: 1,
        pageSize: 25,
        from: "2026-02-01",
        to: "2026-02-28",
        clientId,
        currency: "EUR",
      }),
    );
    expect(summary[0].received).toBe("22.22");
    expect(summary[0].unallocated).toBe("22.22");
  });
});
