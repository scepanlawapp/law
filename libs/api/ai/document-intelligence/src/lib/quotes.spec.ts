import { foldForMatch, locateQuote } from "./quotes";

describe("foldForMatch", () => {
  it("is case, script, diacritic and whitespace insensitive", () => {
    expect(foldForMatch("  Ime:   Петар\nPetrović ")).toBe(
      "ime: petar petrovic",
    );
    expect(foldForMatch("ЂОРЂЕ Đurđević")).toBe("dorde durdevic");
  });
});

describe("locateQuote", () => {
  it("finds a folded quote and returns the offset in the original text", () => {
    expect(locateQuote("Ime: Петар\nPetrović", "ime: petar petrovic")).toBe(0);
  });

  it("maps the folded offset back to the original text", () => {
    const text = "Uvod\n\nПрезиме:  Петровић, rođen 1990.";
    const start = locateQuote(text, "prezime: petrovic");
    expect(start).toBe(text.indexOf("Презиме"));
  });

  it("returns null for an absent or empty quote", () => {
    expect(locateQuote("Ime: Petar", "Marko Marković")).toBeNull();
    expect(locateQuote("Ime: Petar", "   ")).toBeNull();
  });
});
