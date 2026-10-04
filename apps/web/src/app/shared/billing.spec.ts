import {
  formatHoursMinutes,
  previousMonth,
  priceMinutes,
  usagePercent,
  usageState,
} from "./billing";

describe("usageState", () => {
  const state = (coveredMinutes: number, includedMinutes: number | null) =>
    usageState({ coveredMinutes, includedMinutes });

  it("is exact at the 80% and 100% thresholds", () => {
    // 80% of 1200 min = 960 min.
    expect(state(959, 1200)).toBe("ok");
    expect(state(960, 1200)).toBe("warning");
    expect(state(1200, 1200)).toBe("warning");
    expect(state(1201, 1200)).toBe("exceeded");
  });

  it("flags an exact 80% share", () => {
    // 4 / 5 is exactly 80%; the integer comparison must flag it.
    expect(state(4, 5)).toBe("warning");
    expect(state(3, 5)).toBe("ok");
  });

  it("is ok when there is no cap", () => {
    expect(state(5000, null)).toBe("ok");
    expect(state(5000, 0)).toBe("ok");
    expect(
      usagePercent({ coveredMinutes: 5000, includedMinutes: null }),
    ).toBeNull();
  });
});

describe("priceMinutes", () => {
  it("prices whole hours and partial hours", () => {
    expect(priceMinutes(90, "8000.00")).toBe(12000);
    expect(priceMinutes(45, "8000")).toBe(6000);
    expect(priceMinutes(0, "8000.00")).toBe(0);
  });

  it("rounds half-up to 2 decimals without float drift", () => {
    // 100.50 / 60 = 1.675 -> 1.68 (a float multiply gives 1.67).
    expect(priceMinutes(1, "100.50")).toBe(1.68);
    // 0.30 / 60 = 0.005 -> 0.01.
    expect(priceMinutes(1, "0.30")).toBe(0.01);
    expect(priceMinutes(7, "1000.05")).toBe(116.67);
  });

  it("rejects an unusable rate or duration", () => {
    expect(priceMinutes(30, null)).toBeNull();
    expect(priceMinutes(30, "")).toBeNull();
    expect(priceMinutes(30, "abc")).toBeNull();
    expect(priceMinutes(-5, "100.00")).toBeNull();
    expect(priceMinutes(1.5, "100.00")).toBeNull();
  });
});

describe("invoice month helpers", () => {
  it("steps back one month across a year boundary", () => {
    expect(previousMonth("2026-10")).toBe("2026-09");
    expect(previousMonth("2026-01")).toBe("2025-12");
  });

  it("formats a duration as hours and minutes", () => {
    expect(formatHoursMinutes(90)).toBe("1 h 30 min");
    expect(formatHoursMinutes(45)).toBe("0 h 45 min");
  });
});
