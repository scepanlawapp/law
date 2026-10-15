import { ForbiddenException } from "@nestjs/common";
import { WorkspaceContextService } from "@law/core";
import type { AssistantTurnScope } from "@law/mastra";
import { AssistantBillingReadsService } from "@law/chat";

const owner: AssistantTurnScope = {
  workspaceId: "workspace-1",
  sessionId: "session-1",
  jobId: "job-1",
  correlationId: "corr-1",
  messageId: "message-1",
  language: "sr",
  userId: "user-owner",
  userDisplayName: "Ana Jović",
};

const alfa = { id: "client-alfa", displayName: "Alfa doo", clientNumber: "K-0001" };

function invoice(overrides: Record<string, unknown> = {}) {
  return {
    id: "invoice-1",
    invoiceNumber: "F-1/2026",
    clientId: "client-alfa",
    clientName: "Alfa doo",
    currency: "RSD",
    status: "SENT",
    dateOfCreate: "2026-09-01",
    dateOfMaturity: "2026-09-15",
    grossAmount: "1000.00",
    paidAmount: "0.00",
    remainingAmount: "1000.00",
    collectionStatus: "UNPAID",
    overdue: true,
    daysOverdue: 30,
    ...overrides,
  };
}

function setup(role = "OWNER") {
  const actors: Array<{ userId?: string; role?: string }> = [];
  const record = () => {
    const current = WorkspaceContextService.current;
    actors.push({ userId: current?.userId, role: current?.role });
  };
  const prisma = {
    workspaceMember: { findFirst: jest.fn().mockResolvedValue({ role }) },
    client: { findMany: jest.fn().mockResolvedValue([alfa]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
  const workEntries = {
    review: jest.fn(),
    list: jest.fn().mockImplementation(() => {
      record();
      return Promise.resolve({
        items: [
          { minutes: 60, value: "6000.00", currency: "RSD" },
          { minutes: 30, value: "50.00", currency: "EUR" },
          { minutes: 15, value: null, currency: null },
        ],
        meta: { totalItems: 3 },
      });
    }),
  };
  const payments = {
    collections: jest.fn().mockImplementation(() => {
      record();
      return Promise.resolve([
        invoice(),
        invoice({
          id: "invoice-2",
          invoiceNumber: "F-2/2026",
          dateOfMaturity: "2026-12-01",
          remainingAmount: "500.50",
          overdue: false,
          daysOverdue: 0,
        }),
        invoice({ id: "invoice-3", status: "DRAFT" }),
        invoice({ id: "invoice-4", remainingAmount: "0.00" }),
      ]);
    }),
  };
  const retainers = {
    usageForViewer: jest.fn().mockResolvedValue({
      currency: "RSD",
      fee: "30000.00",
      includedMinutes: 600,
      coveredMinutes: 420,
      outOfScopeMinutes: 30,
    }),
  };
  const service = new AssistantBillingReadsService(
    prisma as never,
    workEntries as never,
    payments as never,
    retainers as never,
  );
  return { service, prisma, workEntries, payments, retainers, actors };
}

describe("AssistantBillingReadsService", () => {
  it("rebuilds the day as the owner and lists only finished meetings", async () => {
    const { service, workEntries } = setup();
    const actors: Array<string | undefined> = [];
    workEntries.review.mockImplementation(() => {
      actors.push(WorkspaceContextService.current?.userId);
      return Promise.resolve({
        entries: [{ minutes: 90 }, { minutes: null }],
        proposed: [{ id: "p1" }],
        missingEvents: [
          {
            eventId: "event-done",
            title: "Sastanak sa Alfom",
            startsAt: "2020-01-01T09:00:00.000Z",
            endsAt: "2020-01-01T10:30:00.000Z",
            client: { displayName: "Alfa doo" },
            case: { caseNumber: "2026-21", name: "Zakup" },
          },
          {
            eventId: "event-later",
            title: "Ročište",
            startsAt: "2999-01-01T09:00:00.000Z",
            endsAt: "2999-01-01T10:00:00.000Z",
            client: null,
            case: null,
          },
        ],
        untouchedClients: [
          { client: { displayName: "Beta doo" }, reasons: ["DOCUMENT", "CHAT"] },
        ],
      });
    });

    const result = await service.getDayWork(owner, { date: "2020-01-01" });

    expect(actors).toEqual(["user-owner"]);
    expect(result).toEqual({
      status: "OK",
      date: "2020-01-01",
      loggedMinutes: 90,
      loggedEntries: 2,
      openProposed: 1,
      unloggedMeetings: [
        {
          ref: "event:event-done",
          title: "Sastanak sa Alfom",
          time: "10:00–11:30",
          minutes: 90,
          client: "Alfa doo",
          case: "2026-21 – Zakup",
        },
      ],
      untrackedClients: [{ client: "Beta doo", reasons: ["dokument", "razgovor"] }],
    });
  });

  it("refuses a day in the future", async () => {
    const { service, workEntries } = setup();
    const result = await service.getDayWork(owner, { date: "2999-01-01" });
    expect(result).toMatchObject({ status: "INVALID" });
    expect(workEntries.review).not.toHaveBeenCalled();
  });

  it("answers a client's money picture with totals per currency", async () => {
    const { service, actors } = setup("OWNER");

    const result = await service.getClientBilling(owner, {
      client: "Alfa",
      month: "2026-10",
    });

    expect(result).toMatchObject({
      status: "OK",
      client: "Alfa doo",
      month: "2026-10",
      receivables: {
        status: "OK",
        openInvoices: [
          expect.objectContaining({ invoiceNumber: "F-1/2026", daysOverdue: 30 }),
          expect.objectContaining({ invoiceNumber: "F-2/2026", remaining: "500.50" }),
        ],
        open: [{ currency: "RSD", amount: "1500.50" }],
        overdue: [{ currency: "RSD", amount: "1000.00" }],
        truncated: false,
      },
      unbilledWork: {
        status: "OK",
        minutes: 105,
        entries: 3,
        value: [
          { currency: "EUR", amount: "50.00" },
          { currency: "RSD", amount: "6000.00" },
        ],
        unpricedEntries: 1,
      },
      retainer: {
        status: "OK",
        agreement: expect.objectContaining({ coveredMinutes: 420 }),
      },
    });
    expect(actors.every((actor) => actor.userId === "user-owner")).toBe(true);
  });

  it("reports parts a lawyer may not see instead of reading them as the system", async () => {
    const { service, payments } = setup("LAWYER");
    payments.collections.mockImplementation(() => {
      if (WorkspaceContextService.current?.role !== "OWNER") {
        throw new ForbiddenException("Pristup finansijama nije dozvoljen.");
      }
      return Promise.resolve([invoice()]);
    });

    const result = await service.getClientBilling(owner, { client: "Alfa" });

    expect(result).toMatchObject({
      status: "OK",
      receivables: { status: "NOT_ALLOWED" },
      unbilledWork: { status: "OK" },
      retainer: { status: "OK" },
    });
  });

  it("asks which client when the name is ambiguous", async () => {
    const { service, prisma } = setup();
    prisma.client.findMany.mockResolvedValue([
      alfa,
      { id: "client-alfa-2", displayName: "Alfa Plus doo", clientNumber: "K-0002" },
    ]);
    const result = await service.getClientBilling(owner, { client: "Alfa" });
    expect(result).toMatchObject({
      status: "AMBIGUOUS",
      candidates: ["Alfa doo (K-0001)", "Alfa Plus doo (K-0002)"],
      choices: [
        { label: "Alfa doo (K-0001)", reply: "Alfa doo (K-0001)" },
        { label: "Alfa Plus doo (K-0002)", reply: "Alfa Plus doo (K-0002)" },
      ],
    });
  });

  it("lists receivables most overdue first, or NOT_ALLOWED", async () => {
    const { service, payments } = setup();
    payments.collections.mockResolvedValue([
      invoice({ clientId: "beta", clientName: "Beta doo", daysOverdue: 5 }),
      invoice(),
      invoice({ id: "i-3", overdue: false, daysOverdue: 0 }),
    ]);

    const result = await service.listReceivables(owner, {});

    expect(result).toMatchObject({
      status: "OK",
      clients: [
        { client: "Alfa doo", invoices: 2, maxDaysOverdue: 30 },
        { client: "Beta doo", invoices: 1, maxDaysOverdue: 5 },
      ],
      total: [{ currency: "RSD", amount: "3000.00" }],
    });

    payments.collections.mockRejectedValue(new ForbiddenException());
    await expect(service.listReceivables(owner, {})).resolves.toMatchObject({
      status: "NOT_ALLOWED",
    });
  });

  it("finds a client without diacritics through the folded search", async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: "client-ilic" }]);
    prisma.client.findMany.mockResolvedValue([
      { id: "client-ilic", displayName: "Marko Ilić", clientNumber: "K-0009" },
    ]);

    const result = await service.getClientBilling(owner, { client: "Ilic" });

    expect(result).toMatchObject({ status: "OK", client: "Marko Ilić" });
    expect(prisma.client.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([{ id: { in: ["client-ilic"] } }]),
        }),
      }),
    );
  });
});
