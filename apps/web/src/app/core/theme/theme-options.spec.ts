import {
  DEFAULT_ACCENT,
  DEFAULT_THEME,
  normalizeAccent,
  normalizeTheme,
  toCssAccent,
  toCssTheme,
} from "./theme-options";

describe("theme options", () => {
  it("uses MIDNIGHT and GOLD as defaults", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeAccent(null)).toBe(DEFAULT_ACCENT);
  });

  it("normalizes domain values to CSS identifiers", () => {
    expect(toCssTheme("DEEP_NAVY")).toBe("deep-navy");
    expect(toCssAccent("ROYAL_BLUE")).toBe("royal-blue");
  });

  it("falls back for old and unknown values", () => {
    expect(normalizeTheme("SYSTEM")).toBe("MIDNIGHT");
    expect(normalizeTheme("DARK")).toBe("MIDNIGHT");
    expect(normalizeAccent("BLUE")).toBe("GOLD");
    expect(normalizeAccent("not-a-real-accent")).toBe("GOLD");
  });
});
