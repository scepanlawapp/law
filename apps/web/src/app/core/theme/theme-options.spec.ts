import {
  DEFAULT_ACCENT,
  DEFAULT_FINISH,
  DEFAULT_THEME,
  normalizeAccent,
  normalizeFinish,
  normalizeTheme,
  toCssAccent,
  toCssFinish,
  toCssTheme,
} from "./theme-options";

describe("theme options", () => {
  it("uses MIDNIGHT, GOLD, and SOLID as defaults", () => {
    expect(normalizeTheme(null)).toBe(DEFAULT_THEME);
    expect(normalizeAccent(null)).toBe(DEFAULT_ACCENT);
    expect(normalizeFinish(null)).toBe(DEFAULT_FINISH);
  });

  it("normalizes domain values to CSS identifiers", () => {
    expect(toCssTheme("DEEP_NAVY")).toBe("deep-navy");
    expect(toCssAccent("ROYAL_BLUE")).toBe("royal-blue");
    expect(toCssFinish("METALLIC")).toBe("metallic");
  });

  it("falls back for old and unknown values", () => {
    expect(normalizeTheme("SYSTEM")).toBe("MIDNIGHT");
    expect(normalizeTheme("DARK")).toBe("MIDNIGHT");
    expect(normalizeAccent("BLUE")).toBe("GOLD");
    expect(normalizeAccent("not-a-real-accent")).toBe("GOLD");
    expect(normalizeFinish("NEON")).toBe("SOLID");
    expect(normalizeFinish(undefined)).toBe("SOLID");
  });
});
