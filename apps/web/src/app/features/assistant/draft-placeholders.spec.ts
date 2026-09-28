import {
  countPlaceholders,
  fillPlaceholder,
  findPlaceholders,
} from "./draft-placeholders";

const text =
  "Sud: [UNOS POTREBAN: naziv suda]\nTuženi: ACME, [UNOS POTREBAN: adresa tuženog]\nDostava: [UNOS POTREBAN:  Naziv   suda ]";

describe("draft placeholders", () => {
  it("groups placeholders by label and records their offsets", () => {
    const groups = findPlaceholders(text);
    expect(groups.map((group) => [group.label, group.occurrences.length])).toEqual([
      ["Naziv suda", 2],
      ["Adresa tuženog", 1],
    ]);
    const [first] = groups[0].occurrences;
    expect(text.slice(first.start, first.end)).toBe(
      "[UNOS POTREBAN: naziv suda]",
    );
    expect(countPlaceholders(text)).toBe(3);
  });

  it("fills every occurrence of one group", () => {
    const [court] = findPlaceholders(text);
    const filled = fillPlaceholder(text, court, "Osnovni sud u Nišu");
    expect(filled).toBe(
      "Sud: Osnovni sud u Nišu\nTuženi: ACME, [UNOS POTREBAN: adresa tuženog]\nDostava: Osnovni sud u Nišu",
    );
    expect(countPlaceholders(filled)).toBe(1);
  });

  it("returns nothing for text without placeholders", () => {
    expect(findPlaceholders("TUŽBA")).toEqual([]);
  });
});
