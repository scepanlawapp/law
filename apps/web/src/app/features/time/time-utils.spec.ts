import {
  addDays,
  formatMinutes,
  isIsoDate,
  mondayOf,
  weekDays,
} from "./time-utils";

describe("time utils", () => {
  it("finds the Monday of any weekday, including Sunday", () => {
    expect(mondayOf("2026-10-05")).toBe("2026-10-05"); // Monday
    expect(mondayOf("2026-10-07")).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // Sunday
    expect(mondayOf("2026-10-04")).toBe("2026-09-28"); // Sunday
  });

  it("builds Monday to Sunday and crosses month and DST boundaries", () => {
    expect(weekDays("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
  });

  it("validates ISO dates", () => {
    expect(isIsoDate("2026-10-04")).toBe(true);
    expect(isIsoDate("2026-02-31")).toBe(false);
    expect(isIsoDate("04.10.2026")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
  });

  it("formats minutes", () => {
    expect(formatMinutes(0)).toBe("0m");
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(120)).toBe("2h");
    expect(formatMinutes(90)).toBe("1h 30m");
  });
});
