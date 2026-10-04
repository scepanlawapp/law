import { usagePercent, usageState } from "./billing";

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
