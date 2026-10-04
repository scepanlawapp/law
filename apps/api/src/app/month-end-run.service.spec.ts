import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { MonthEndRunService } from "@law/work-entries";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientA = "33333333-3333-4333-a333-333333333333";
const clientB = "44444444-4444-4444-a444-444444444444";
const agreementId = "55555555-5555-4555-a555-555555555555";
const draftId = "66666666-6666-4666-a666-666666666666";
const feeLineId = "77777777-7777-4777-a777-777777777777";

const MONTH = "2026-09";

type Treatment = "RETAINER" | "HOURLY" | "AT" | "UNDECIDED" | "NON_BILLABLE";

interface FakeEntry {
  id: string;
  clientId: string;
  workDate: Date;
  createdAt: Date;
  minutes: number | null;
  status: string;
  treatment: Treatment;
  serviceCategoryId: string | null;
  caseId: string | null;
  case: { caseNumber: string; name: string } | null;
  serviceCategory: { name: string } | null;
}

let sequence = 0;
function entry(
  date: string,
  minutes: number,
  treatment: Treatment,
  extra: Partial<FakeEntry> = {},
): FakeEntry {
  sequence += 1;
  return {
    id: `e${String(sequence).padStart(7, "0")}-0000-4000-a000-000000000000`,
    clientId: clientA,
    workDate: new Date(date),
    createdAt: new Date(`${date}T08:00:00Z`),
    minutes,
    status: "CONFIRMED",
    treatment,
    serviceCategoryId: null,
    caseId: null,
    case: null,
    serviceCategory: null,
    ...extra,
  };
}

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: agreementId,
    validFrom: new Date("2026-01-01"),
    validTo: null,
    monthlyFee: new Prisma.Decimal("100000.00"),
    currency: "RSD",
    includedMinutes: 1200,
    coveredCategoryIds: [],
    overageRule: "HOURLY",
    overageHourlyRate: new Prisma.Decimal("6000"),
    outOfScopeRule: "HOURLY",
    outOfScopeHourlyRate: new Prisma.Decimal("8000"),
    ...overrides,
  };
}

function clientRow(id: string, displayName: string) {
  return {
    id,
    workspaceId,
    clientNumber: `CL-${displayName}`,
    type: "ORGANIZATION",
    displayName,
    status: "ACTIVE",
  };
}

function covered(count: number, clientId = clientA) {
  return Array.from({ length: count }, (_, index) =>
    entry(`2026-09-${String(index + 1).padStart(2, "0")}`, 60, "RETAINER", {
      clientId,
      status: "BILLED",
    }),
  );
}

describe("MonthEndRunService", () => {
  const state = {
    entries: [] as FakeEntry[],
    billed: [] as FakeEntry[],
    agreements: {} as Record<string, ReturnType<typeof agreement>[]>,
    retainerClients: [] as string[],
    clients: [] as ReturnType<typeof clientRow>[],
    profile: null as null | {
      hourlyRate: Prisma.Decimal | null;
      currency: string | null;
    },
    draft: null as null | { id: string; currency: string },
    feeLines: [] as { id: string; statementId: string }[],
    latestStatement: null as null | {
      placeOfIssue: string;
      methodOfPayment: string;
      country: string;
    },
  };

  const tx = {
    $executeRaw: jest.fn(),
    workEntry: { findMany: jest.fn() },
    retainerAgreement: { findMany: jest.fn() },
    client: { findMany: jest.fn() },
    clientBillingProfile: { findFirst: jest.fn() },
    billingStatement: { findFirst: jest.fn() },
    billingStatementLine: { findMany: jest.fn() },
    $transaction: jest.fn(),
  };
  const billingSetup = {
    getWorkspaceConfig: jest.fn(),
    agreementsForClient: jest.fn(),
  };
  const workEntries = { listOpenInRange: jest.fn() };
  const financials = {
    createDraftFromLines: jest.fn(),
    appendLinesToDraft: jest.fn(),
    attachEntriesToLine: jest.fn(),
  };
  const service = new MonthEndRunService(
    tx as never,
    billingSetup as never,
    workEntries as never,
    financials as never,
  );

  const asRole = <T>(role: WorkspaceRole, fn: () => T): T =>
    WorkspaceContextService.run({ workspaceId, userId, role }, fn);
  const runAsOwner = (month = MONTH) =>
    asRole(WorkspaceRole.OWNER, () => service.run(month));

  const createdLines = (call = 0) =>
    financials.createDraftFromLines.mock.calls[call][1].lines as {
      description: string;
      netAmount: number;
      vatAmount: number;
      grossAmount: number;
      pricingRequired: boolean;
      minutes?: number;
      currency: string;
      workEntryIds?: string[];
    }[];

  beforeAll(() => {
    jest.useFakeTimers({
      now: new Date("2026-10-04T10:00:00Z"),
      doNotFake: [
        "nextTick",
        "setImmediate",
        "clearImmediate",
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "queueMicrotask",
        "hrtime",
        "performance",
      ],
    });
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.resetAllMocks();
    state.entries = [];
    state.billed = [];
    state.agreements = {};
    state.retainerClients = [];
    state.clients = [
      clientRow(clientA, "Alfa doo"),
      clientRow(clientB, "Beta doo"),
    ];
    state.profile = null;
    state.draft = null;
    state.feeLines = [];
    state.latestStatement = null;

    tx.$transaction.mockImplementation(
      async (fn: (client: unknown) => unknown) => fn(tx),
    );
    billingSetup.getWorkspaceConfig.mockResolvedValue({
      targetHourlyRate: null,
      internalCurrency: "RSD",
      defaultVatRate: "20.00",
      paymentTermDays: 15,
    });
    billingSetup.agreementsForClient.mockImplementation(
      async (clientId: string) => state.agreements[clientId] ?? [],
    );
    tx.workEntry.findMany.mockImplementation(
      async (args: {
        where: {
          clientId?: string;
          status: string;
          treatment: { in: string[] } | string;
        };
        distinct?: string[];
      }) => {
        const { where } = args;
        if (where.status === "BILLED")
          return state.billed.filter((row) => row.clientId === where.clientId);
        const rows = state.entries.filter(
          (row) =>
            row.status === where.status &&
            row.minutes !== null &&
            (where.treatment as { in: string[] }).in.includes(row.treatment) &&
            (!where.clientId || row.clientId === where.clientId),
        );
        return args.distinct
          ? [...new Set(rows.map((row) => row.clientId))].map((id) => ({
              clientId: id,
            }))
          : rows;
      },
    );
    tx.retainerAgreement.findMany.mockImplementation(async () =>
      state.retainerClients.map((clientId) => ({ clientId })),
    );
    tx.client.findMany.mockImplementation(
      async ({ where }: { where: { id: { in: string[] } } }) =>
        state.clients.filter((client) => where.id.in.includes(client.id)),
    );
    tx.clientBillingProfile.findFirst.mockImplementation(
      async () => state.profile,
    );
    tx.billingStatement.findFirst.mockImplementation(
      async ({ where }: { where: { status: unknown; currency?: string } }) =>
        where.status === "DRAFT"
          ? state.draft && state.draft.currency === where.currency
            ? state.draft
            : null
          : state.latestStatement,
    );
    tx.billingStatementLine.findMany.mockImplementation(
      async () => state.feeLines,
    );
    financials.createDraftFromLines.mockResolvedValue(draftId);
  });

  it("bills a capped retainer: fee line plus priced overage", async () => {
    state.agreements[clientA] = [agreement()];
    state.entries = Array.from({ length: 21 }, (_, index) =>
      entry(`2026-09-${String(index + 1).padStart(2, "0")}`, 60, "RETAINER"),
    );

    const result = await runAsOwner();

    expect(result.statements).toEqual([
      expect.objectContaining({
        statementId: draftId,
        currency: "RSD",
        created: true,
        addedLines: 2,
        pricingRequiredLines: 0,
        client: expect.objectContaining({ id: clientA }),
      }),
    ]);
    const [input] = financials.createDraftFromLines.mock.calls[0].slice(1);
    expect(input).toMatchObject({
      clientId: clientA,
      currency: "RSD",
      billingMonth: MONTH,
      header: {
        dateOfCreate: "2026-10-04",
        dateOfTurnover: "2026-09-30",
        dateOfMaturity: "2026-10-19",
        placeOfIssue: "",
        methodOfPayment: "Prenos na račun",
        country: "Srbija",
        vatRate: 20,
      },
    });
    const [fee, overage] = createdLines();
    expect(fee).toMatchObject({
      description: "Paušal za septembar 2026",
      netAmount: 100000,
      vatAmount: 20000,
      grossAmount: 120000,
      pricingRequired: false,
      minutes: 1200,
    });
    expect(fee.workEntryIds).toHaveLength(20);
    expect(overage).toMatchObject({
      description: "Prekoračenje paušala: 1 h 0 min",
      netAmount: 6000,
      vatAmount: 1200,
      grossAmount: 7200,
      minutes: 60,
    });
    expect(overage.workEntryIds).toEqual([state.entries[20].id]);
  });

  it("copies the header from the client's latest statement", async () => {
    state.agreements[clientA] = [agreement()];
    state.retainerClients = [clientA];
    state.latestStatement = {
      placeOfIssue: "Novi Sad",
      methodOfPayment: "Gotovina",
      country: "Srbija",
    };

    await runAsOwner();

    expect(
      financials.createDraftFromLines.mock.calls[0][1].header,
    ).toMatchObject({ placeOfIssue: "Novi Sad", methodOfPayment: "Gotovina" });
  });

  it("re-run adds only the new overage to the same draft", async () => {
    state.agreements[clientA] = [agreement()];
    state.draft = { id: draftId, currency: "RSD" };
    state.feeLines = [{ id: feeLineId, statementId: draftId }];
    state.billed = covered(21);
    state.entries = [entry("2026-09-25", 30, "RETAINER")];

    const result = await runAsOwner();

    expect(financials.createDraftFromLines).not.toHaveBeenCalled();
    expect(financials.attachEntriesToLine).not.toHaveBeenCalled();
    expect(financials.appendLinesToDraft).toHaveBeenCalledTimes(1);
    const [, statementId, lines] = financials.appendLinesToDraft.mock.calls[0];
    expect(statementId).toBe(draftId);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      description: "Prekoračenje paušala: 0 h 30 min",
      netAmount: 3000,
      minutes: 30,
    });
    expect(result.statements).toEqual([
      expect.objectContaining({
        statementId: draftId,
        created: false,
        addedLines: 1,
      }),
    ]);
  });

  it("counts overage entries as consumed cap when a later entry arrives", async () => {
    // 19 h on the fee line, then a 2 h entry that straddled the cap: 1 h of
    // it was overage. Nothing more fits under the cap.
    state.agreements[clientA] = [agreement()];
    state.draft = { id: draftId, currency: "RSD" };
    state.feeLines = [{ id: feeLineId, statementId: draftId }];
    state.billed = [
      ...covered(19),
      entry("2026-09-20", 120, "RETAINER", { status: "BILLED" }),
    ];
    state.entries = [entry("2026-09-25", 30, "RETAINER")];

    await runAsOwner();

    expect(financials.attachEntriesToLine).not.toHaveBeenCalled();
    expect(financials.appendLinesToDraft.mock.calls[0][2][0]).toMatchObject({
      description: "Prekoračenje paušala: 0 h 30 min",
    });
  });

  it("attaches covered work within the cap to the existing fee line", async () => {
    state.agreements[clientA] = [agreement()];
    state.draft = { id: draftId, currency: "RSD" };
    state.feeLines = [{ id: feeLineId, statementId: draftId }];
    state.billed = covered(5);
    const fresh = entry("2026-09-25", 30, "RETAINER");
    state.entries = [fresh];

    const result = await runAsOwner();

    expect(financials.attachEntriesToLine).toHaveBeenCalledWith(tx, feeLineId, [
      fresh.id,
    ]);
    expect(financials.appendLinesToDraft).not.toHaveBeenCalled();
    expect(result.statements[0]).toMatchObject({
      statementId: draftId,
      created: false,
      addedLines: 0,
    });
  });

  it("does not charge the fee again when it is already on a sent statement", async () => {
    state.agreements[clientA] = [agreement()];
    state.feeLines = [{ id: feeLineId, statementId: "sent-statement" }];
    state.billed = covered(5);
    const fresh = entry("2026-09-25", 30, "RETAINER");
    state.entries = [fresh];

    await runAsOwner();

    const [line] = createdLines();
    expect(line).toMatchObject({
      description: "Paušal za septembar 2026 (dodatni rad u okviru paušala)",
      netAmount: 0,
      workEntryIds: [fresh.id],
    });
  });

  it("does nothing on a re-run with no new work", async () => {
    state.agreements[clientA] = [agreement()];
    state.retainerClients = [clientA];
    state.draft = { id: draftId, currency: "RSD" };
    state.feeLines = [{ id: feeLineId, statementId: draftId }];
    state.billed = covered(5);

    const result = await runAsOwner();

    expect(result.statements).toEqual([]);
    expect(financials.createDraftFromLines).not.toHaveBeenCalled();
    expect(financials.appendLinesToDraft).not.toHaveBeenCalled();
  });

  it("prorates the fee for a retainer starting mid-month", async () => {
    state.agreements[clientA] = [
      agreement({ validFrom: new Date("2026-09-15"), includedMinutes: null }),
    ];
    state.retainerClients = [clientA];

    await runAsOwner();

    const [fee] = createdLines();
    expect(fee.description).toBe(
      "Paušal za septembar 2026 (srazmerno, 16/30 dana)",
    );
    // 100000 x 16 / 30, half-up.
    expect(fee).toMatchObject({
      netAmount: 53333.33,
      vatAmount: 10666.67,
      grossAmount: 64000,
    });
    expect(fee.workEntryIds).toBeUndefined();
  });

  it("splits a EUR retainer from RSD hourly work into two drafts", async () => {
    state.agreements[clientA] = [
      agreement({
        currency: "EUR",
        monthlyFee: new Prisma.Decimal("500.00"),
        validFrom: new Date("2026-09-15"),
        includedMinutes: null,
      }),
    ];
    state.profile = { hourlyRate: new Prisma.Decimal("9000"), currency: "RSD" };
    const covered = entry("2026-09-20", 60, "RETAINER");
    const before = entry("2026-09-05", 90, "HOURLY");
    state.entries = [covered, before];
    financials.createDraftFromLines
      .mockResolvedValueOnce("draft-eur")
      .mockResolvedValueOnce("draft-rsd");

    const result = await runAsOwner();

    expect(financials.createDraftFromLines).toHaveBeenCalledTimes(2);
    const inputs = financials.createDraftFromLines.mock.calls.map(
      ([, input]) => input,
    );
    const eur = inputs.find((input) => input.currency === "EUR");
    const rsd = inputs.find((input) => input.currency === "RSD");
    expect(
      eur.lines.map((line: { currency: string }) => line.currency),
    ).toEqual(["EUR"]);
    expect(eur.lines[0].workEntryIds).toEqual([covered.id]);
    expect(rsd.lines).toEqual([
      expect.objectContaining({
        currency: "RSD",
        netAmount: 13500,
        vatAmount: 2700,
        minutes: 90,
        pricingRequired: false,
        workEntryIds: [before.id],
      }),
    ]);
    expect(result.statements.map((row) => row.currency).sort()).toEqual([
      "EUR",
      "RSD",
    ]);
  });

  it("flags hourly work without a rate as needing a price", async () => {
    state.entries = [entry("2026-09-05", 60, "HOURLY")];

    const result = await runAsOwner();

    expect(createdLines()[0]).toMatchObject({
      description: "Ostali rad",
      netAmount: 0,
      pricingRequired: true,
    });
    expect(result.statements[0].pricingRequiredLines).toBe(1);
  });

  it("leaves AT entries unpriced, grouped by case, in the retainer currency", async () => {
    state.agreements[clientA] = [
      agreement({ currency: "EUR", includedMinutes: null }),
    ];
    state.profile = { hourlyRate: null, currency: "RSD" };
    const first = entry("2026-09-03", 60, "AT", {
      caseId: "case-1",
      case: { caseNumber: "P-1/2026", name: "Spor" },
    });
    const second = entry("2026-09-04", 45, "AT", {
      caseId: "case-1",
      case: { caseNumber: "P-1/2026", name: "Spor" },
    });
    state.entries = [first, second];

    const result = await runAsOwner();

    expect(createdLines().map((line) => line.description)).toEqual([
      "Paušal za septembar 2026",
      "P-1/2026 Spor",
    ]);
    expect(createdLines()[1]).toMatchObject({
      currency: "EUR",
      netAmount: 0,
      vatAmount: 0,
      grossAmount: 0,
      pricingRequired: true,
      minutes: 105,
      workEntryIds: [first.id, second.id],
    });
    expect(result.statements[0].pricingRequiredLines).toBe(1);
  });

  it("prices out-of-scope hourly work per case or category at the agreement rate", async () => {
    state.agreements[clientA] = [agreement({ includedMinutes: null })];
    state.entries = [
      entry("2026-09-03", 90, "HOURLY", {
        caseId: "case-1",
        case: { caseNumber: "P-1/2026", name: "Spor" },
      }),
      entry("2026-09-04", 30, "HOURLY", {
        serviceCategoryId: "cat-1",
        serviceCategory: { name: "Registracije" },
      }),
      entry("2026-09-05", 60, "HOURLY"),
    ];

    await runAsOwner();

    const [, caseLine, categoryLine, otherLine] = createdLines();
    expect(caseLine).toMatchObject({
      description: "P-1/2026 Spor",
      netAmount: 12000,
      minutes: 90,
    });
    expect(categoryLine).toMatchObject({
      description: "Registracije",
      netAmount: 4000,
    });
    expect(otherLine).toMatchObject({
      description: "Ostali rad",
      netAmount: 8000,
    });
  });

  it("flags overage as needing a price when the rule is AT", async () => {
    state.agreements[clientA] = [
      agreement({ overageRule: "AT", overageHourlyRate: null }),
    ];
    state.entries = Array.from({ length: 21 }, (_, index) =>
      entry(`2026-09-${String(index + 1).padStart(2, "0")}`, 60, "RETAINER"),
    );

    const result = await runAsOwner();

    expect(createdLines()[1]).toMatchObject({
      description: "Prekoračenje paušala: 1 h 0 min",
      netAmount: 0,
      pricingRequired: true,
    });
    expect(result.statements[0].pricingRequiredLines).toBe(1);
  });

  it("bills ABSORBED overage on the fee line with no overage line", async () => {
    state.agreements[clientA] = [agreement({ overageRule: "ABSORBED" })];
    state.entries = Array.from({ length: 22 }, (_, index) =>
      entry(`2026-09-${String(index + 1).padStart(2, "0")}`, 60, "RETAINER"),
    );

    await runAsOwner();

    const lines = createdLines();
    expect(lines).toHaveLength(1);
    expect(lines[0].workEntryIds).toHaveLength(22);
  });

  it("excludes undecided and unconfirmed entries and lists them in the pre-check", async () => {
    state.entries = [
      entry("2026-09-03", 60, "UNDECIDED"),
      entry("2026-09-04", 60, "HOURLY", { status: "PROPOSED" }),
      entry("2026-09-05", 60, "NON_BILLABLE"),
    ];

    const result = await runAsOwner();

    expect(result.statements).toEqual([]);
    expect(financials.createDraftFromLines).not.toHaveBeenCalled();

    const open = [
      { id: "b", client: { id: clientB, displayName: "Beta doo" } },
      { id: "a1", client: { id: clientA, displayName: "Alfa doo" } },
      { id: "a2", client: { id: clientA, displayName: "Alfa doo" } },
    ];
    workEntries.listOpenInRange.mockResolvedValue(open);
    const precheck = await asRole(WorkspaceRole.OWNER, () =>
      service.precheck(MONTH),
    );
    expect(workEntries.listOpenInRange).toHaveBeenCalledWith(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-09-30T00:00:00Z"),
    );
    expect(precheck.month).toBe(MONTH);
    expect(precheck.clients.map((row) => row.client.id)).toEqual([
      clientA,
      clientB,
    ]);
    expect(precheck.clients[0].open.map((row) => row.id)).toEqual(["a1", "a2"]);
  });

  it("rolls back only the conflicting client and keeps going", async () => {
    state.entries = [
      entry("2026-09-03", 60, "AT", { clientId: clientA }),
      entry("2026-09-03", 60, "AT", { clientId: clientB }),
    ];
    financials.createDraftFromLines
      .mockRejectedValueOnce(new ConflictException("claimed"))
      .mockResolvedValueOnce("draft-b");

    const result = await runAsOwner();

    expect(result.statements).toEqual([
      expect.objectContaining({
        client: expect.objectContaining({ id: clientA }),
        created: false,
        addedLines: 0,
        pricingRequiredLines: 0,
      }),
      expect.objectContaining({
        client: expect.objectContaining({ id: clientB }),
        statementId: "draft-b",
        created: true,
        addedLines: 1,
      }),
    ]);
    expect(tx.$transaction).toHaveBeenCalledTimes(2);
  });

  it("lets other failures abort the run", async () => {
    state.entries = [entry("2026-09-03", 60, "AT")];
    financials.createDraftFromLines.mockRejectedValue(new Error("db down"));

    await expect(runAsOwner()).rejects.toThrow("db down");
  });

  it("only bills clients of this workspace", async () => {
    state.entries = [
      entry("2026-09-03", 60, "AT", {
        clientId: "99999999-9999-4999-a999-999999999999",
      }),
    ];

    const result = await runAsOwner();

    expect(result.statements).toEqual([]);
    expect(tx.client.findMany).toHaveBeenCalledWith({
      where: {
        id: { in: ["99999999-9999-4999-a999-999999999999"] },
        workspaceId,
      },
    });
  });

  it("is owner only", async () => {
    for (const role of [WorkspaceRole.ADMIN, WorkspaceRole.LAWYER]) {
      await expect(
        asRole(role, () => service.run(MONTH)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        asRole(role, () => service.precheck(MONTH)),
      ).rejects.toBeInstanceOf(ForbiddenException);
    }
    expect(financials.createDraftFromLines).not.toHaveBeenCalled();
  });

  it("rejects a malformed month", async () => {
    for (const month of ["2026-9", "2026-13", "september"]) {
      await expect(runAsOwner(month)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
  });
});
