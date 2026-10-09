import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from "@nestjs/common";
import {
  defaultRevenueConfiguration,
  RevenueAgreement,
  RevenueConfiguration,
  RevenuePreviewScenario,
  RevenueSpecialRule,
  WorkspaceRole,
  revenueEmptyRates,
} from "@law/api-interfaces";
import {
  PlatformPrismaService,
  WorkspaceContextService,
  WORKSPACE_ROLE_KEY,
} from "@law/core";
import {
  RevenueSharingController,
  RevenueSharingService,
  previewRevenue,
  validateConfiguration,
} from "@law/revenue-sharing";

const worker = "11111111-1111-4111-8111-111111111111";
const originator = "22222222-2222-4222-8222-222222222222";
const workspaceId = "workspace-test";
const date = "2099-04-01";
const rate = (percentage: string) => ({
  state: "PERCENTAGE" as const,
  percentage,
});
const scenario = (
  extra: Partial<RevenuePreviewScenario> = {},
): RevenuePreviewScenario => ({
  amount: "100000.00",
  revenueBasis: "COLLECTED",
  memberId: worker,
  clientOrigin: "OTHER_ATTORNEY_CLIENT",
  originatorId: originator,
  referenceDate: date,
  collectionDate: null,
  clientId: null,
  caseId: null,
  eventId: null,
  agreementId: null,
  specialRuleId: null,
  ...extra,
});
const configuration = (): RevenueConfiguration => ({
  ...defaultRevenueConfiguration(),
  enabled: true,
  configurationMode: "ADVANCED",
  rates: {
    ...revenueEmptyRates(),
    OWN_CLIENT: rate("40"),
    OTHER_ATTORNEY_CLIENT: rate("30"),
    OFFICE_CLIENT: rate("30"),
  },
  originationEnabled: true,
  originationRate: rate("10"),
});
const agreement = (
  extra: Partial<RevenueAgreement> = {},
): RevenueAgreement => ({
  id: "33333333-3333-4333-8333-333333333333",
  memberId: worker,
  agreementType: "INDIVIDUAL",
  effectiveFrom: "2099-01-01",
  effectiveTo: null,
  rates: { ...revenueEmptyRates(true), OWN_CLIENT: rate("45") },
  originationRate: { state: "INHERIT", percentage: null },
  selfOrigination: null,
  departurePolicy: "RETAIN_EARNINGS_ON_PRIOR_WORK",
  departureCutoffDate: null,
  description: "",
  ...extra,
});
const rule = (extra: Partial<RevenueSpecialRule> = {}): RevenueSpecialRule => ({
  id: "44444444-4444-4444-8444-444444444444",
  memberId: worker,
  scopeType: "FIRM",
  scopeId: null,
  earningType: "WORK_SHARE",
  clientOrigin: "OTHER_ATTORNEY_CLIENT",
  percentage: "35",
  revenueBasis: "COLLECTED",
  combinationMode: "OVERRIDE",
  poolId: null,
  effectiveFrom: "2099-01-01",
  effectiveTo: null,
  active: true,
  description: "",
  ...extra,
});

function withContext<T>(fn: () => T, role = WorkspaceRole.OWNER) {
  return WorkspaceContextService.run({ userId: worker, workspaceId, role }, fn);
}

describe("Revenue settings validation and preview", () => {
  it("defaults to disabled, unconfigured rules and work execution reference date", () => {
    const c = defaultRevenueConfiguration();
    expect(c.enabled).toBe(false);
    expect(c.rates.OWN_CLIENT.state).toBe("UNCONFIGURED");
    expect(c.entitlementDatePolicy).toBe("WORK_EXECUTION_DATE");
  });
  it("previews work, origination and residual without mutating settings", () => {
    const c = configuration(),
      original = JSON.stringify(c);
    const r = previewRevenue(c, scenario());
    expect(r.workAmount).toBe("30000.00");
    expect(r.originationAmount).toBe("10000.00");
    expect(r.residual).toBe("60000.00");
    expect(JSON.stringify(c)).toBe(original);
  });
  it("does not double-count self origination by default", () => {
    const r = previewRevenue(
      configuration(),
      scenario({ clientOrigin: "OWN_CLIENT", originatorId: worker }),
    );
    expect(r.workPercentage).toBe("40.00");
    expect(r.originationAmount).toBe("0.00");
  });
  it("permits explicitly enabled self origination", () => {
    const c = configuration();
    c.selfOrigination = true;
    expect(
      previewRevenue(
        c,
        scenario({ clientOrigin: "OWN_CLIENT", originatorId: worker }),
      ).total,
    ).toBe("50000.00");
  });
  it("resolves a personal override and per-field inheritance separately", () => {
    const c = configuration();
    c.agreements = [agreement()];
    expect(
      previewRevenue(
        c,
        scenario({ clientOrigin: "OWN_CLIENT", originatorId: worker }),
      ).workPercentage,
    ).toBe("45.00");
    expect(previewRevenue(c, scenario()).workPercentage).toBe("30.00");
  });
  it("keeps exclusion distinct from unconfigured and configured zero", () => {
    const c = configuration();
    c.originationEnabled = false;
    expect(
      previewRevenue(c, scenario({ clientOrigin: "UNKNOWN_ORIGIN" })).warnings,
    ).toContain("REQUIRES_CONFIGURATION");
    c.rates.UNKNOWN_ORIGIN = rate("0");
    expect(
      previewRevenue(c, scenario({ clientOrigin: "UNKNOWN_ORIGIN" }))
        .workAmount,
    ).toBe("0.00");
    c.agreements = [agreement({ agreementType: "EXCLUDED" })];
    expect(previewRevenue(c, scenario()).workAmount).toBe("0.00");
    c.configurationMode = "SHARED_RULES";
    expect(previewRevenue(c, scenario()).workAmount).toBe("0.00");
  });
  it("preserves personal rules when shared mode makes overrides inactive", () => {
    const c = configuration();
    c.agreements = [agreement()];
    c.configurationMode = "SHARED_RULES";
    expect(
      previewRevenue(
        c,
        scenario({ clientOrigin: "OWN_CLIENT", originatorId: worker }),
      ).workPercentage,
    ).toBe("40.00");
    expect(c.agreements[0].rates.OWN_CLIENT.percentage).toBe("45");
  });
  it("resolves event precedence and additive rates above a less-specific override", () => {
    const c = configuration();
    c.specialRules = [
      rule(),
      rule({
        id: "55555555-5555-4555-8555-555555555555",
        scopeType: "WORK_EVENT",
        scopeId: originator,
        combinationMode: "ADDITIVE",
        percentage: "5",
      }),
    ];
    const r = previewRevenue(c, scenario({ eventId: originator }));
    expect(r.workPercentage).toBe("40.00");
    expect(r.appliedRuleIds).toHaveLength(2);
  });
  it("requires a base rule for additive shares", () => {
    const c = configuration();
    c.rates.OTHER_ATTORNEY_CLIENT = { state: "UNCONFIGURED", percentage: null };
    c.specialRules = [rule({ combinationMode: "ADDITIVE" })];
    expect(previewRevenue(c, scenario()).warnings).toContain(
      "REQUIRES_CONFIGURATION",
    );
  });

  it("requires an applicable agreement during engagement gaps and permits a return period", () => {
    const c = configuration();
    c.agreements = [agreement({ effectiveTo: "2099-03-01" })];
    expect(previewRevenue(c, scenario()).warnings).toContain(
      "AGREEMENT_NOT_APPLICABLE",
    );
    c.agreements.push(agreement({ id: originator, effectiveFrom: date }));
    expect(previewRevenue(c, scenario()).warnings).toHaveLength(0);
  });
  it("rejects overlapping agreements but permits returning members in a new period", () => {
    const c = configuration();
    c.agreements = [
      agreement({ effectiveTo: "2099-03-31" }),
      agreement({ id: originator, effectiveFrom: "2099-04-01" }),
    ];
    expect(() => validateConfiguration(c)).not.toThrow();
    c.agreements[1].effectiveFrom = "2099-03-31";
    expect(() => validateConfiguration(c)).toThrow(BadRequestException);
  });
  it("rejects conflicting same-precedence rules including wildcard conditions", () => {
    const c = configuration();
    c.specialRules = [
      rule({ earningType: "ORIGINATION_BONUS", clientOrigin: null }),
      rule({ id: originator, earningType: "ORIGINATION_BONUS" }),
    ];
    expect(() => validateConfiguration(c)).toThrow(BadRequestException);
    expect(
      previewRevenue(
        { ...c, specialRules: [rule(), rule({ id: originator })] },
        scenario(),
      ).warnings,
    ).toContain("RULE_CONFLICT");
  });
  it("enforces the 100% limit only for the same exclusive pool", () => {
    const c = configuration();
    c.specialRules = [
      rule({
        combinationMode: "EXCLUSIVE_SPLIT",
        poolId: "pool",
        percentage: "60",
      }),
      rule({
        id: originator,
        memberId: originator,
        combinationMode: "EXCLUSIVE_SPLIT",
        poolId: "pool",
        percentage: "50",
      }),
    ];
    expect(() => validateConfiguration(c)).toThrow();
    c.specialRules[1].poolId = "other-pool";
    expect(() => validateConfiguration(c)).not.toThrow();
    c.specialRules = [rule({ combinationMode: "ADDITIVE", percentage: "90" })];
    expect(() => validateConfiguration(c)).not.toThrow();
  });
  it("does not over-allocate a cent through independent rounding", () => {
    const c = configuration();
    c.rates.OTHER_ATTORNEY_CLIENT = rate("50");
    c.originationRate = rate("50");
    const r = previewRevenue(c, scenario({ amount: "0.01" }));
    expect(r.total).toBe("0.01");
    expect(r.residual).toBe("0.00");
  });
  it("keeps earned work after departure or stops later collection explicitly", () => {
    const c = configuration();
    c.agreements = [agreement({ effectiveTo: "2099-06-01" })];
    const s = scenario({ collectionDate: "2099-07-01" });
    expect(previewRevenue(c, s).workPercentage).toBe("30.00");
    c.agreements[0].departurePolicy = "STOP_AT_DEPARTURE";
    expect(previewRevenue(c, s).workPercentage).toBe("0.00");
    expect(previewRevenue(c, scenario()).warnings).toContain(
      "COLLECTION_DATE_REQUIRED",
    );
  });
  it.each(["-1", "100.01", "1.234", "NaN", "1e1"])(
    "rejects invalid percentage %s",
    (value) => {
      const c = configuration();
      c.rates.OWN_CLIENT = rate(value);
      expect(() => validateConfiguration(c)).toThrow();
    },
  );
});

describe("RevenueSharingService publication boundary", () => {
  let db: {
    revenueSharingVersion: Record<string, jest.Mock>;
    revenueSharingSettings: Record<string, jest.Mock>;
    revenueSharingAgreement: Record<string, jest.Mock>;
    workspaceMember: Record<string, jest.Mock>;
    client: Record<string, jest.Mock>;
    case: Record<string, jest.Mock>;
    event: Record<string, jest.Mock>;
    $transaction?: jest.Mock;
  };
  let service: RevenueSharingService;
  beforeEach(() => {
    db = {
      revenueSharingVersion: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockImplementation(async ({ data }) => data),
        findMany: jest.fn().mockResolvedValue([]),
      },
      revenueSharingSettings: {
        upsert: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      revenueSharingAgreement: { findMany: jest.fn().mockResolvedValue([]) },
      workspaceMember: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ userId: worker }, { userId: originator }]),
      },
      client: { count: jest.fn().mockResolvedValue(0) },
      case: { count: jest.fn().mockResolvedValue(0) },
      event: { count: jest.fn().mockResolvedValue(0) },
    };
    db.$transaction = jest.fn((callback) => callback(db));
    service = new RevenueSharingService(db as unknown as PlatformPrismaService);
  });
  it("returns disabled defaults without creating financial records", async () => {
    const r = await withContext(() => service.get());
    expect(r.configuration.enabled).toBe(false);
    expect(r.version).toBe(0);
    expect(db.revenueSharingVersion.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { workspaceId } }),
    );
  });
  it("persists firm percentages, exclusions and disabled settings without discarding rules", async () => {
    const c = configuration();
    c.enabled = false;
    const r = await withContext(() =>
      service.publish({
        expectedVersion: 0,
        effectiveFrom: date,
        reason: "",
        configuration: c,
      }),
    );
    expect(r.configuration.rates.OWN_CLIENT.percentage).toBe("40");
    expect(r.configuration.enabled).toBe(false);
    expect(db.revenueSharingVersion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workspaceId, createdBy: worker }),
      }),
    );
  });
  it("creates new immutable agreement snapshots without updating past terms", async () => {
    const c = configuration();
    c.agreements = [agreement({ effectiveTo: "2099-03-31" })];
    db.revenueSharingVersion.findFirst.mockResolvedValue({
      version: 1,
      effectiveFrom: new Date("2099-01-01"),
      configuration: structuredClone(c),
    });
    c.agreements.push(agreement({ id: originator, effectiveFrom: date }));
    await withContext(() =>
      service.publish({
        expectedVersion: 1,
        effectiveFrom: date,
        reason: "",
        configuration: c,
      }),
    );
    expect(
      db.revenueSharingVersion.create.mock.calls[0][0].data.agreements.create,
    ).toHaveLength(2);
  });
  it("rejects historical term rewrites", async () => {
    const old = configuration();
    old.agreements = [agreement()];
    db.revenueSharingVersion.findFirst.mockResolvedValue({
      version: 1,
      effectiveFrom: new Date("2099-01-01"),
      configuration: old,
    });
    const next = structuredClone(old);
    next.agreements[0].rates.OWN_CLIENT = rate("99");
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: next,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it("allows closing a historical open period immediately before new terms begin", async () => {
    const old = configuration();
    old.agreements = [agreement()];
    db.revenueSharingVersion.findFirst.mockResolvedValue({
      version: 1,
      effectiveFrom: new Date("2099-01-01"),
      configuration: old,
    });
    const next = structuredClone(old);
    next.agreements[0].effectiveTo = "2099-03-31";
    next.agreements.push(agreement({ id: originator, effectiveFrom: date }));
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: next,
        }),
      ),
    ).resolves.toMatchObject({ version: 2 });
  });
  it("retains former-member agreements when the active membership is removed", async () => {
    const c = configuration();
    c.agreements = [agreement()];
    db.workspaceMember.findMany.mockResolvedValue([]);
    db.revenueSharingAgreement.findMany.mockResolvedValue([
      { memberId: worker },
    ]);
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 0,
          effectiveFrom: date,
          reason: "",
          configuration: c,
        }),
      ),
    ).resolves.toMatchObject({ version: 1 });
  });
  it("rejects foreign members and foreign scope records", async () => {
    const c = configuration();
    c.agreements = [agreement()];
    db.workspaceMember.findMany.mockResolvedValue([]);
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 0,
          effectiveFrom: date,
          reason: "",
          configuration: c,
        }),
      ),
    ).rejects.toThrow();
    c.agreements = [];
    c.specialRules = [rule({ scopeType: "CLIENT", scopeId: originator })];
    db.workspaceMember.findMany.mockResolvedValue([{ userId: worker }]);
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 0,
          effectiveFrom: date,
          reason: "",
          configuration: c,
        }),
      ),
    ).rejects.toThrow();
    expect(db.client.count).toHaveBeenCalledWith({
      where: { workspaceId, id: { in: [originator] } },
    });
  });

  it("can deactivate a previously valid deleted scope without accepting new foreign references", async () => {
    const old = configuration();
    old.specialRules = [rule({ scopeType: "CLIENT", scopeId: originator })];
    db.revenueSharingVersion.findFirst.mockResolvedValue({
      version: 1,
      effectiveFrom: new Date("2099-01-01"),
      configuration: old,
    });
    const next = structuredClone(old);
    next.specialRules[0].active = false;
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: next,
        }),
      ),
    ).resolves.toMatchObject({ version: 2 });
    next.specialRules.push(
      rule({
        id: worker,
        scopeType: "CLIENT",
        scopeId: originator,
        active: false,
      }),
    );
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: next,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });
  it("rejects unauthorized reads and mutations and requires ADMIN at the controller", async () => {
    await expect(
      withContext(() => service.get(), WorkspaceRole.LAWYER),
    ).rejects.toThrow(ForbiddenException);
    await expect(
      withContext(() => service.publish({}), WorkspaceRole.MEMBER),
    ).rejects.toThrow(ForbiddenException);
    expect(
      Reflect.getMetadata(WORKSPACE_ROLE_KEY, RevenueSharingController),
    ).toBe(WorkspaceRole.ADMIN);
  });
  it("rejects stale publication rather than losing another user’s changes", async () => {
    db.revenueSharingVersion.findFirst.mockResolvedValue({ version: 2 });
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: configuration(),
        }),
      ),
    ).rejects.toThrow(ConflictException);
    expect(db.revenueSharingVersion.create).not.toHaveBeenCalled();
  });

  it("publishes documented departure amendments without changing historical rates", async () => {
    const old = configuration();
    old.agreements = [agreement()];
    db.revenueSharingVersion.findFirst.mockResolvedValue({
      version: 1,
      effectiveFrom: new Date("2099-01-01"),
      configuration: structuredClone(old),
    });
    const next = structuredClone(old);
    next.agreements[0].departurePolicy = "STOP_AT_DEPARTURE";
    next.agreements[0].departureCutoffDate = date;
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "",
          configuration: next,
        }),
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      withContext(() =>
        service.publish({
          expectedVersion: 1,
          effectiveFrom: date,
          reason: "Departure agreement",
          configuration: next,
        }),
      ),
    ).resolves.toMatchObject({ version: 2 });
    expect(old.agreements[0].departurePolicy).toBe(
      "RETAIN_EARNINGS_ON_PRIOR_WORK",
    );
    expect(next.agreements[0].rates).toEqual(old.agreements[0].rates);
  });
  it("uses later recorded departure terms for collection without replacing work-date rates", async () => {
    const original = configuration();
    original.agreements = [agreement()];
    const later = structuredClone(original);
    later.agreements[0].departurePolicy = "STOP_AT_DEPARTURE";
    later.agreements[0].departureCutoffDate = date;
    later.agreements[0].effectiveTo = date;
    db.revenueSharingVersion.findFirst
      .mockResolvedValueOnce({
        version: 1,
        effectiveFrom: new Date("2099-01-01"),
        configuration: original,
      })
      .mockResolvedValueOnce({
        version: 2,
        effectiveFrom: new Date(date),
        configuration: later,
      });
    const resolved = await withContext(() =>
      service.resolveConfiguration("2099-02-01", "2099-07-01"),
    );
    expect(resolved.configuration.agreements[0].rates).toEqual(
      original.agreements[0].rates,
    );
    expect(resolved.configuration.agreements[0].departurePolicy).toBe(
      "STOP_AT_DEPARTURE",
    );
    expect(
      previewRevenue(
        resolved.configuration,
        scenario({ referenceDate: "2099-02-01", collectionDate: "2099-07-01" }),
      ).workAmount,
    ).toBe("0.00");
    expect(original.agreements[0].departurePolicy).toBe(
      "RETAIN_EARNINGS_ON_PRIOR_WORK",
    );
  });
  it("resolves the snapshot effective on the requested entitlement date", async () => {
    await withContext(() => service.resolveConfiguration("2099-02-01"));
    expect(db.revenueSharingVersion.findFirst).toHaveBeenCalledWith({
      where: { workspaceId, effectiveFrom: { lte: new Date("2099-02-01") } },
      orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }],
    });
  });
});
