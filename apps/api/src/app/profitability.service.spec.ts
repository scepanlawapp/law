import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { ProfitabilityService } from "@law/work-entries";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userA = "22222222-2222-4222-a222-222222222222";
const userB = "33333333-3333-4333-a333-333333333333";
const clientA = "55555555-5555-4555-a555-555555555555";
const clientB = "66666666-6666-4666-a666-666666666666";
const clientC = "77777777-7777-4777-a777-777777777777";

const D = (value: string) => new Prisma.Decimal(value);

function inRole<T>(role: WorkspaceRole, fn: () => T): T {
  return WorkspaceContextService.run({ workspaceId, userId: userA, role }, fn);
}

function clientRow(id: string, displayName: string) {
  return {
    id,
    clientNumber: `K-${displayName}`,
    type: "LEGAL_ENTITY",
    displayName,
    status: "ACTIVE",
  };
}

function person(id: string, firstName: string) {
  return { id, firstName, lastName: "Test", email: `${firstName}@law.rs` };
}

interface EntryFixture {
  userId?: string;
  clientId?: string;
  minutes: number | null;
  workDate?: string;
  status?: "CONFIRMED" | "BILLED" | "WRITTEN_OFF";
  statementLineId?: string | null;
}

describe("ProfitabilityService", () => {
  const db = {
    workspaceConfig: { findUnique: jest.fn() },
    workEntry: { findMany: jest.fn() },
    billingStatement: { findMany: jest.fn() },
    userRate: { findMany: jest.fn() },
    client: { findMany: jest.fn() },
  };
  const service = new ProfitabilityService(db as never);

  function setEntries(entries: EntryFixture[]) {
    db.workEntry.findMany.mockResolvedValue(
      entries.map((entry) => {
        const userId = entry.userId ?? userA;
        return {
          userId,
          clientId: entry.clientId ?? clientA,
          minutes: entry.minutes,
          workDate: new Date(entry.workDate ?? "2026-10-05"),
          status: entry.status ?? "BILLED",
          statementLineId:
            entry.statementLineId === undefined
              ? "line"
              : entry.statementLineId,
          user: person(userId, userId === userA ? "Ana" : "Bojan"),
        };
      }),
    );
  }

  function setStatements(
    statements: { clientId: string; currency: string; nets: string[] }[],
  ) {
    db.billingStatement.findMany.mockResolvedValue(
      statements.map((statement) => ({
        clientId: statement.clientId,
        currency: statement.currency,
        lines: statement.nets.map((net) => ({ netAmount: D(net) })),
      })),
    );
  }

  function setRates(
    rates: { userId: string; hourlyValue: string; effectiveFrom: string }[],
  ) {
    db.userRate.findMany.mockResolvedValue(
      rates.map((rate) => ({
        userId: rate.userId,
        hourlyValue: D(rate.hourlyValue),
        effectiveFrom: new Date(rate.effectiveFrom),
      })),
    );
  }

  const report = (from = "2026-10-01", to = "2026-10-31") =>
    inRole(WorkspaceRole.OWNER, () => service.report(from, to));

  beforeEach(() => {
    jest.resetAllMocks();
    db.workspaceConfig.findUnique.mockResolvedValue({
      internalCurrency: "RSD",
      targetHourlyRate: D("5000"),
    });
    db.client.findMany.mockResolvedValue([
      clientRow(clientA, "Alfa doo"),
      clientRow(clientB, "Beta doo"),
      clientRow(clientC, "Gama doo"),
    ]);
    setEntries([]);
    setStatements([]);
    setRates([
      { userId: userA, hourlyValue: "3000", effectiveFrom: "2026-01-01" },
    ]);
  });

  it("values 600 minutes at 3000/h against RSD 60 000 revenue", async () => {
    setEntries([{ minutes: 600 }]);
    setStatements([
      { clientId: clientA, currency: "RSD", nets: ["40000", "20000"] },
    ]);

    const result = await report();

    expect(result.internalCurrency).toBe("RSD");
    expect(result.targetHourlyRate).toBe("5000.00");
    expect(result.rows).toEqual([
      expect.objectContaining({
        minutes: 600,
        revenue: [{ currency: "RSD", net: "60000.00" }],
        timeValue: "30000.00",
        unknownValueMinutes: 0,
        effectiveHourlyRate: "6000.00",
        comparable: true,
        writtenOffValue: "0.00",
        unbilledValue: "0.00",
      }),
    ]);
    expect(result.rows[0].client.id).toBe(clientA);
  });

  it("scopes the queries to SENT statements and the date range", async () => {
    await report("2026-10-01", "2026-10-31");

    expect(db.billingStatement.findMany.mock.calls[0][0].where).toEqual({
      workspaceId,
      status: "SENT",
      dateOfTurnover: {
        gte: new Date("2026-10-01"),
        lte: new Date("2026-10-31"),
      },
    });
    expect(db.workEntry.findMany.mock.calls[0][0].where).toEqual({
      workspaceId,
      status: { in: ["CONFIRMED", "BILLED", "WRITTEN_OFF"] },
      workDate: { gte: new Date("2026-10-01"), lte: new Date("2026-10-31") },
    });
  });

  it("is not comparable and has no effective rate for foreign currency revenue", async () => {
    setEntries([{ minutes: 600 }]);
    setStatements([{ clientId: clientA, currency: "EUR", nets: ["500"] }]);

    const [row] = (await report()).rows;

    expect(row.revenue).toEqual([{ currency: "EUR", net: "500.00" }]);
    expect(row.comparable).toBe(false);
    expect(row.effectiveHourlyRate).toBeNull();
    expect(row.timeValue).toBe("30000.00");
  });

  it("is not comparable when any revenue currency differs from the internal one", async () => {
    setEntries([{ minutes: 60 }]);
    setStatements([
      { clientId: clientA, currency: "RSD", nets: ["1000"] },
      { clientId: clientA, currency: "EUR", nets: ["10"] },
    ]);

    const [row] = (await report()).rows;

    expect(row.revenue.map((entry) => entry.currency)).toEqual(["EUR", "RSD"]);
    expect(row.comparable).toBe(false);
    expect(row.effectiveHourlyRate).toBeNull();
  });

  it("counts minutes of a user without a rate as unknown and leaves them out of the value", async () => {
    setEntries([
      { minutes: 60 },
      { userId: userB, minutes: 120, clientId: clientA },
    ]);

    const [row] = (await report()).rows;

    expect(row.minutes).toBe(180);
    expect(row.unknownValueMinutes).toBe(120);
    expect(row.timeValue).toBe("3000.00");
  });

  it("has no time value when none of the minutes can be priced", async () => {
    setRates([]);
    setEntries([{ minutes: 90 }]);

    const [row] = (await report()).rows;

    expect(row.unknownValueMinutes).toBe(90);
    expect(row.timeValue).toBeNull();
  });

  it("prices each entry with the rate in force on its work date", async () => {
    setRates([
      { userId: userA, hourlyValue: "3000", effectiveFrom: "2026-01-01" },
      { userId: userA, hourlyValue: "4000", effectiveFrom: "2026-10-15" },
    ]);
    setEntries([
      { minutes: 60, workDate: "2026-10-14" },
      { minutes: 60, workDate: "2026-10-15" },
      { minutes: 60, workDate: "2026-10-20" },
    ]);

    const [row] = (await report()).rows;

    expect(row.timeValue).toBe("11000.00");
    expect(row.unknownValueMinutes).toBe(0);
  });

  it("treats an entry before the first rate as unknown", async () => {
    setRates([
      { userId: userA, hourlyValue: "3000", effectiveFrom: "2026-10-10" },
    ]);
    setEntries([
      { minutes: 60, workDate: "2026-10-05" },
      { minutes: 60, workDate: "2026-10-10" },
    ]);

    const [row] = (await report()).rows;

    expect(row.unknownValueMinutes).toBe(60);
    expect(row.timeValue).toBe("3000.00");
  });

  it("prices written-off and unbilled time separately and keeps them out of time value", async () => {
    setEntries([
      { minutes: 60, status: "BILLED" },
      { minutes: 120, status: "WRITTEN_OFF", statementLineId: null },
      { minutes: 30, status: "CONFIRMED", statementLineId: null },
      { minutes: 30, status: "CONFIRMED", statementLineId: "line" },
    ]);

    const [row] = (await report()).rows;

    expect(row.minutes).toBe(120);
    expect(row.timeValue).toBe("6000.00");
    expect(row.writtenOffValue).toBe("6000.00");
    expect(row.unbilledValue).toBe("1500.00");
  });

  it("counts entries with null minutes as zero", async () => {
    setEntries([{ minutes: null }, { minutes: 60 }]);

    const [row] = (await report()).rows;

    expect(row.minutes).toBe(60);
    expect(row.timeValue).toBe("3000.00");
  });

  it("lists a client with revenue only and a client with entries only", async () => {
    setEntries([{ clientId: clientB, minutes: 60 }]);
    setStatements([{ clientId: clientC, currency: "RSD", nets: ["900"] }]);

    const { rows } = await report();

    const byId = Object.fromEntries(rows.map((row) => [row.client.id, row]));
    expect(Object.keys(byId).sort()).toEqual([clientB, clientC].sort());
    expect(byId[clientC].minutes).toBe(0);
    expect(byId[clientC].comparable).toBe(true);
    expect(byId[clientC].effectiveHourlyRate).toBeNull();
    expect(byId[clientC].timeValue).toBe("0.00");
    expect(byId[clientB].revenue).toEqual([]);
    expect(byId[clientB].comparable).toBe(true);
    expect(byId[clientB].effectiveHourlyRate).toBeNull();
  });

  it("orders the worst effective rate first with unknown rates last", async () => {
    setEntries([
      { clientId: clientA, minutes: 60 },
      { clientId: clientB, minutes: 60 },
      { clientId: clientC, minutes: 60 },
    ]);
    setStatements([
      { clientId: clientA, currency: "RSD", nets: ["9000"] },
      { clientId: clientB, currency: "RSD", nets: ["1000"] },
      { clientId: clientC, currency: "EUR", nets: ["50"] },
    ]);

    const { rows } = await report();

    expect(rows.map((row) => row.client.id)).toEqual([
      clientB,
      clientA,
      clientC,
    ]);
    expect(rows.map((row) => row.effectiveHourlyRate)).toEqual([
      "1000.00",
      "9000.00",
      null,
    ]);
  });

  it("breaks ties by client name", async () => {
    setEntries([
      { clientId: clientB, minutes: 60 },
      { clientId: clientA, minutes: 60 },
    ]);

    const { rows } = await report();

    expect(rows.map((row) => row.client.displayName)).toEqual([
      "Alfa doo",
      "Beta doo",
    ]);
  });

  it("rounds the effective rate half up to two decimals", async () => {
    setEntries([{ minutes: 7 }]);
    setStatements([{ clientId: clientA, currency: "RSD", nets: ["100"] }]);

    const [row] = (await report()).rows;

    // 100 / (7/60) = 857.142857...
    expect(row.effectiveHourlyRate).toBe("857.14");
  });

  it("reports logged against billed minutes per person, without written-off time", async () => {
    setEntries([
      { minutes: 120, status: "BILLED" },
      { minutes: 60, status: "CONFIRMED", statementLineId: null },
      { minutes: 500, status: "WRITTEN_OFF", statementLineId: null },
      {
        userId: userB,
        minutes: 30,
        status: "CONFIRMED",
        statementLineId: null,
      },
      { userId: userB, minutes: null, status: "BILLED" },
    ]);

    const { byPerson } = await report();

    expect(byPerson).toEqual([
      {
        user: { id: userA, displayName: "Ana Test", email: "Ana@law.rs" },
        loggedMinutes: 180,
        billedMinutes: 120,
      },
      {
        user: { id: userB, displayName: "Bojan Test", email: "Bojan@law.rs" },
        loggedMinutes: 30,
        billedMinutes: 0,
      },
    ]);
  });

  it("allows an admin and refuses lawyers and members", async () => {
    await expect(
      inRole(WorkspaceRole.ADMIN, () =>
        service.report("2026-10-01", "2026-10-31"),
      ),
    ).resolves.toEqual(expect.objectContaining({ rows: [] }));

    db.workEntry.findMany.mockClear();
    for (const role of [WorkspaceRole.LAWYER, WorkspaceRole.MEMBER]) {
      await expect(
        inRole(role, () => service.report("2026-10-01", "2026-10-31")),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(db.workEntry.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ["2026-10-01", "2026-9-30"],
    ["2026-10-01", "not-a-date"],
    ["2026-02-30", "2026-03-01"],
    ["2026-10-31", "2026-10-01"],
    [undefined as unknown as string, "2026-10-01"],
  ])("rejects the range %s to %s", async (from, to) => {
    await expect(
      inRole(WorkspaceRole.OWNER, () => service.report(from, to)),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
