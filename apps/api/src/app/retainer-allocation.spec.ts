import {
  activeAgreementOn,
  allocate,
  defaultTreatment,
  priceMinutes,
  prorate,
  type AgreementTerms,
  type AllocEntry,
} from "@law/work-entries";
import { Prisma } from "@prisma/client";

const day = (value: string) => new Date(`${value}T00:00:00.000Z`);

function agreement(overrides: Partial<AgreementTerms> = {}): AgreementTerms {
  return {
    id: "agr-1",
    validFrom: day("2026-01-01"),
    validTo: null,
    monthlyFee: new Prisma.Decimal(30000),
    currency: "RSD",
    includedMinutes: 600,
    coveredCategoryIds: [],
    overageRule: "HOURLY",
    overageHourlyRate: new Prisma.Decimal(6000),
    outOfScopeRule: "HOURLY",
    outOfScopeHourlyRate: new Prisma.Decimal(7000),
    ...overrides,
  };
}

function entry(overrides: Partial<AllocEntry> & { id: string }): AllocEntry {
  return {
    workDate: day("2026-09-01"),
    createdAt: new Date("2026-09-01T08:00:00.000Z"),
    minutes: 60,
    serviceCategoryId: null,
    caseId: null,
    treatment: "RETAINER",
    ...overrides,
  };
}

describe("activeAgreementOn", () => {
  it("returns the agreement covering the date, or null", () => {
    const a = agreement({
      id: "a",
      validFrom: day("2026-01-01"),
      validTo: day("2026-06-30"),
    });
    const b = agreement({ id: "b", validFrom: day("2026-07-01") });
    expect(activeAgreementOn([a, b], day("2026-06-30"))?.id).toBe("a");
    expect(activeAgreementOn([a, b], day("2026-07-01"))?.id).toBe("b");
    expect(activeAgreementOn([a], day("2026-07-01"))).toBeNull();
    expect(activeAgreementOn([a, b], day("2025-12-31"))).toBeNull();
  });

  it("prefers the latest validFrom when several overlap", () => {
    const a = agreement({ id: "a", validFrom: day("2026-01-01") });
    const b = agreement({ id: "b", validFrom: day("2026-03-01") });
    expect(activeAgreementOn([a, b], day("2026-04-01"))?.id).toBe("b");
    expect(activeAgreementOn([b, a], day("2026-04-01"))?.id).toBe("b");
  });
});

describe("defaultTreatment", () => {
  it("is UNDECIDED without an agreement", () => {
    expect(defaultTreatment(null, "cat-1")).toBe("UNDECIDED");
  });

  it("is RETAINER when the agreement covers every category", () => {
    expect(defaultTreatment(agreement(), "cat-1")).toBe("RETAINER");
    expect(defaultTreatment(agreement(), null)).toBe("RETAINER");
  });

  it("is RETAINER for an included category", () => {
    const a = agreement({ coveredCategoryIds: ["cat-1"] });
    expect(defaultTreatment(a, "cat-1")).toBe("RETAINER");
  });

  it("follows the out-of-scope rule for other categories", () => {
    const base = { coveredCategoryIds: ["cat-1"] };
    expect(
      defaultTreatment(
        agreement({ ...base, outOfScopeRule: "HOURLY" }),
        "cat-2",
      ),
    ).toBe("HOURLY");
    expect(
      defaultTreatment(agreement({ ...base, outOfScopeRule: "AT" }), "cat-2"),
    ).toBe("AT");
    expect(
      defaultTreatment(
        agreement({ ...base, outOfScopeRule: "ABSORBED" }),
        "cat-2",
      ),
    ).toBe("RETAINER");
    expect(
      defaultTreatment(agreement({ ...base, outOfScopeRule: "HOURLY" }), null),
    ).toBe("HOURLY");
  });
});

describe("prorate", () => {
  it("prorates a mid-month start", () => {
    const result = prorate(
      agreement({ validFrom: day("2026-09-15"), includedMinutes: 1200 }),
      "2026-09",
    );
    expect(result?.activeDays).toBe(16);
    expect(result?.daysInMonth).toBe(30);
    expect(result?.fee.toFixed(2)).toBe("16000.00");
    expect(result?.includedMinutes).toBe(640);
  });

  it("returns the full fee for a full month", () => {
    const result = prorate(agreement(), "2026-09");
    expect(result?.activeDays).toBe(30);
    expect(result?.fee.toFixed(2)).toBe("30000.00");
    expect(result?.includedMinutes).toBe(600);
  });

  it("returns null when the agreement ended before the month", () => {
    expect(
      prorate(agreement({ validTo: day("2026-08-31") }), "2026-09"),
    ).toBeNull();
  });

  it("returns null when the agreement starts after the month", () => {
    expect(
      prorate(agreement({ validFrom: day("2026-10-01") }), "2026-09"),
    ).toBeNull();
  });

  it("handles an end inside the month and leap-year February", () => {
    const ended = prorate(agreement({ validTo: day("2026-09-10") }), "2026-09");
    expect(ended?.activeDays).toBe(10);
    const feb = prorate(
      agreement({ monthlyFee: new Prisma.Decimal(29000) }),
      "2028-02",
    );
    expect(feb?.daysInMonth).toBe(29);
    expect(feb?.fee.toFixed(2)).toBe("29000.00");
  });

  it("keeps a null cap null and rounds the fee half-up", () => {
    const result = prorate(
      agreement({
        validFrom: day("2026-09-02"),
        monthlyFee: new Prisma.Decimal(100),
        includedMinutes: null,
      }),
      "2026-09",
    );
    expect(result?.activeDays).toBe(29);
    expect(result?.fee.toFixed(2)).toBe("96.67");
    expect(result?.includedMinutes).toBeNull();
  });
});

describe("allocate", () => {
  const full = (a: AgreementTerms) => prorate(a, "2026-09")!;
  const covered = [
    entry({ id: "e1", minutes: 300, workDate: day("2026-09-01") }),
    entry({ id: "e2", minutes: 200, workDate: day("2026-09-02") }),
    entry({ id: "e3", minutes: 200, workDate: day("2026-09-03") }),
  ];

  it("moves entries past the cap to overage", () => {
    const a = agreement();
    const result = allocate(a, full(a), 0, [
      covered[2],
      covered[0],
      covered[1],
    ]);
    expect(result.feeEntryIds).toEqual(["e1", "e2"]);
    expect(result.overage).toEqual({ entryIds: ["e3"], minutes: 100 });
    expect(result.outOfScope).toEqual([]);
  });

  it("counts only the minutes above the cap, honouring already covered minutes", () => {
    const a = agreement();
    const result = allocate(a, full(a), 550, [
      entry({ id: "e1", minutes: 120 }),
    ]);
    expect(result.feeEntryIds).toEqual([]);
    expect(result.overage).toEqual({ entryIds: ["e1"], minutes: 70 });
  });

  it("covers untimed (0-minute) work even past the cap", () => {
    const a = agreement();
    const result = allocate(a, full(a), 600, [
      entry({ id: "e1", minutes: 0 }),
    ]);
    expect(result.feeEntryIds).toEqual(["e1"]);
    expect(result.overage).toBeNull();
  });

  it("absorbs overage when the rule is ABSORBED", () => {
    const a = agreement({ overageRule: "ABSORBED", overageHourlyRate: null });
    const result = allocate(a, full(a), 0, covered);
    expect(result.feeEntryIds).toEqual(["e1", "e2", "e3"]);
    expect(result.overage).toBeNull();
  });

  it("covers everything when there is no cap", () => {
    const a = agreement({ includedMinutes: null });
    const result = allocate(a, full(a), 0, covered);
    expect(result.feeEntryIds).toEqual(["e1", "e2", "e3"]);
    expect(result.overage).toBeNull();
  });

  it("breaks ties on workDate by createdAt", () => {
    const a = agreement({ includedMinutes: 100 });
    const early = entry({
      id: "early",
      minutes: 100,
      createdAt: new Date("2026-09-01T08:00:00Z"),
    });
    const late = entry({
      id: "late",
      minutes: 50,
      createdAt: new Date("2026-09-01T09:00:00Z"),
    });
    const result = allocate(a, full(a), 0, [late, early]);
    expect(result.feeEntryIds).toEqual(["early"]);
    expect(result.overage).toEqual({ entryIds: ["late"], minutes: 50 });
  });

  it("groups out-of-scope entries by case, then by category", () => {
    const a = agreement();
    const result = allocate(a, full(a), 0, [
      entry({
        id: "o1",
        treatment: "HOURLY",
        caseId: "case-1",
        minutes: 30,
        workDate: day("2026-09-01"),
      }),
      entry({
        id: "o2",
        treatment: "AT",
        serviceCategoryId: "cat-9",
        minutes: 20,
        workDate: day("2026-09-02"),
      }),
      entry({
        id: "o3",
        treatment: "HOURLY",
        caseId: "case-1",
        serviceCategoryId: "cat-9",
        minutes: 10,
        workDate: day("2026-09-03"),
      }),
      entry({
        id: "o4",
        treatment: "HOURLY",
        minutes: 5,
        workDate: day("2026-09-04"),
      }),
      entry({
        id: "o5",
        treatment: "AT",
        serviceCategoryId: "cat-9",
        minutes: 15,
        workDate: day("2026-09-05"),
      }),
    ]);
    expect(result.outOfScope).toEqual([
      { groupKey: "case-1", entryIds: ["o1", "o3"], minutes: 40 },
      { groupKey: "cat:cat-9", entryIds: ["o2", "o5"], minutes: 35 },
      { groupKey: "cat:none", entryIds: ["o4"], minutes: 5 },
    ]);
    expect(result.feeEntryIds).toEqual([]);
  });

  it("ignores non-billable and undecided entries", () => {
    const a = agreement();
    const result = allocate(a, full(a), 0, [
      entry({ id: "n1", treatment: "NON_BILLABLE" }),
      entry({ id: "u1", treatment: "UNDECIDED" }),
    ]);
    expect(result).toEqual({ feeEntryIds: [], overage: null, outOfScope: [] });
  });
});

describe("priceMinutes", () => {
  it("prices minutes at an hourly rate, rounding half-up", () => {
    expect(priceMinutes(90, new Prisma.Decimal(6000)).toFixed(2)).toBe(
      "9000.00",
    );
    expect(priceMinutes(10, new Prisma.Decimal(100)).toFixed(2)).toBe("16.67");
    expect(priceMinutes(1, new Prisma.Decimal(3)).toFixed(2)).toBe("0.05");
  });
});
