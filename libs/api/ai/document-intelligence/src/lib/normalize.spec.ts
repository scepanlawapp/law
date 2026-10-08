import { buildJmbg, buildPib } from "../testing/test-identifiers";
import { normalizeFacts, type RawFact } from "./normalize";

const JMBG = buildJmbg("0101990");
const OTHER_JMBG = buildJmbg("0202985");
const PIB = buildPib("10000001");

function raw(overrides: Partial<RawFact>): RawFact {
  return {
    subjectKey: "p1",
    subjectType: "PERSON",
    subjectRole: null,
    field: "fullName",
    value: "Petar Petrović",
    quote: "Petar Petrović",
    confidence: 0.9,
    ...overrides,
  };
}

const TEXT = [
  "LIČNA KARTA",
  "Ime: Petar Petrović",
  `JMBG: ${JMBG}`,
  `Drugi JMBG: ${OTHER_JMBG}`,
  "JMBG: 0101990710001",
  "Datum rođenja: 01.01.1990.",
  `PIB: ${PIB.slice(0, 3)} ${PIB.slice(3, 6)} ${PIB.slice(6)}`,
].join("\n");

describe("normalizeFacts", () => {
  it("keeps a verified fact with its offset in the original text", () => {
    const [fact] = normalizeFacts([raw({})], TEXT, "ID_CARD");
    expect(fact).toMatchObject({
      subjectKey: "p1",
      field: "fullName",
      value: "Petar Petrović",
      charStart: TEXT.indexOf("Petar Petrović"),
      confidence: 0.9,
    });
  });

  it("drops a jmbg with a bad checksum", () => {
    const facts = normalizeFacts(
      [
        raw({
          field: "jmbg",
          value: "0101990710001",
          quote: "JMBG: 0101990710001",
        }),
      ],
      TEXT,
      "ID_CARD",
    );
    expect(facts).toEqual([]);
  });

  it("keeps a valid jmbg and normalizes to 13 digits", () => {
    const [fact] = normalizeFacts(
      [
        raw({
          field: "jmbg",
          value: JMBG.replace(/(\d{6})/, "$1 "),
          quote: `JMBG: ${JMBG}`,
        }),
      ],
      TEXT,
      "ID_CARD",
    );
    expect(fact.normalizedValue).toBe(JMBG);
  });

  it("normalizes a pib with spaces to 9 digits", () => {
    const [fact] = normalizeFacts(
      [
        raw({
          subjectKey: "c1",
          subjectType: "COMPANY",
          field: "taxNumber",
          value: `${PIB.slice(0, 3)} ${PIB.slice(3, 6)} ${PIB.slice(6)}`,
          quote: `PIB: ${PIB.slice(0, 3)} ${PIB.slice(3, 6)} ${PIB.slice(6)}`,
        }),
      ],
      TEXT,
      "APR_EXCERPT",
    );
    expect(fact.normalizedValue).toBe(PIB);
  });

  it("drops a pib whose check digit is wrong", () => {
    const bad = `${PIB.slice(0, 8)}${(Number(PIB[8]) + 1) % 10}`;
    const facts = normalizeFacts(
      [
        raw({
          subjectType: "COMPANY",
          field: "taxNumber",
          value: bad,
          quote: `PIB: ${PIB.slice(0, 3)} ${PIB.slice(3, 6)} ${PIB.slice(6)}`,
        }),
      ],
      TEXT,
      "APR_EXCERPT",
    );
    expect(facts).toEqual([]);
  });

  it("normalizes dates to ISO", () => {
    const [fact] = normalizeFacts(
      [
        raw({
          field: "dateOfBirth",
          value: "01.01.1990.",
          quote: "Datum rođenja: 01.01.1990.",
        }),
      ],
      TEXT,
      "ID_CARD",
    );
    expect(fact.normalizedValue).toBe("1990-01-01");
  });

  it("drops an unknown field and a field that belongs to another kind", () => {
    expect(
      normalizeFacts([raw({ field: "favouriteColour" })], TEXT, "ID_CARD"),
    ).toEqual([]);
    expect(
      normalizeFacts(
        [raw({ field: "caseNumber", value: "Petar Petrović" })],
        TEXT,
        "ID_CARD",
      ),
    ).toEqual([]);
  });

  it("drops a fact whose quote is not in the text", () => {
    expect(
      normalizeFacts(
        [raw({ quote: "Marko Marković", value: "Marko Marković" })],
        TEXT,
        "ID_CARD",
      ),
    ).toEqual([]);
  });

  it("drops a jmbg whose birth date disagrees with the dateOfBirth of the same subject", () => {
    const facts = normalizeFacts(
      [
        raw({
          field: "jmbg",
          value: OTHER_JMBG,
          quote: `Drugi JMBG: ${OTHER_JMBG}`,
        }),
        raw({
          field: "dateOfBirth",
          value: "01.01.1990.",
          quote: "Datum rođenja: 01.01.1990.",
        }),
      ],
      TEXT,
      "ID_CARD",
    );
    expect(facts.map((f) => f.field)).toEqual(["dateOfBirth"]);
  });

  it("keeps a jmbg whose birth date matches, and does not compare across subjects", () => {
    const facts = normalizeFacts(
      [
        raw({
          field: "jmbg",
          value: OTHER_JMBG,
          subjectKey: "p2",
          quote: `Drugi JMBG: ${OTHER_JMBG}`,
        }),
        raw({
          field: "dateOfBirth",
          value: "01.01.1990.",
          quote: "Datum rođenja: 01.01.1990.",
        }),
      ],
      TEXT,
      "ID_CARD",
    );
    expect(facts.map((f) => f.field)).toEqual(["jmbg", "dateOfBirth"]);
  });

  it("drops an identifier value that is not in its quote", () => {
    const facts = normalizeFacts(
      [raw({ field: "jmbg", value: OTHER_JMBG, quote: `JMBG: ${JMBG}` })],
      TEXT,
      "ID_CARD",
    );
    expect(facts).toEqual([]);
  });

  it("stores values in Latin and clamps confidence", () => {
    const text = "Име: Петар Петровић";
    const [fact] = normalizeFacts(
      [
        raw({
          value: "Петар Петровић",
          quote: "Име: Петар Петровић",
          confidence: 7,
        }),
      ],
      text,
      "ID_CARD",
    );
    expect(fact.value).toBe("Petar Petrović");
    expect(fact.charStart).toBe(0);
    expect(fact.confidence).toBe(1);
  });

  describe("value must be printed in its quote", () => {
    const probeText = "Ime: Petar Petrović\nMesto rođenja: Niš";

    it("drops a fullName that differs from its quote", () => {
      expect(
        normalizeFacts(
          [raw({ value: "Marko Marković", quote: "Petar Petrović" })],
          probeText,
          "ID_CARD",
        ),
      ).toEqual([]);
    });

    it("drops a dateOfBirth whose quote holds no such date", () => {
      expect(
        normalizeFacts(
          [raw({ field: "dateOfBirth", value: "05.05.1985.", quote: "Niš" })],
          probeText,
          "ID_CARD",
        ),
      ).toEqual([]);
    });

    it("drops a one-letter quote used to back a longer value", () => {
      expect(
        normalizeFacts(
          [raw({ field: "address", value: "Bulevar 1", quote: "a" })],
          probeText,
          "ID_CARD",
        ),
      ).toEqual([]);
    });

    it("drops a quote shorter than its value", () => {
      expect(
        normalizeFacts(
          [
            raw({
              field: "placeOfBirth",
              value: "Niš i okolina",
              quote: "Niš",
            }),
          ],
          probeText,
          "ID_CARD",
        ),
      ).toEqual([]);
    });

    it("accepts a value that is a fragment of a longer quote, across scripts", () => {
      const [fact] = normalizeFacts(
        [
          raw({
            field: "placeOfBirth",
            value: "Ниш",
            quote: "Mesto rođenja: Niš",
          }),
        ],
        probeText,
        "ID_CARD",
      );
      expect(fact.value).toBe("Niš");
    });

    it.each([
      ["1.1.1990", "Datum rođenja: 1.1.1990"],
      ["01. 01. 1990.", "Datum rođenja: 01. 01. 1990."],
      ["1990-01-01", "Datum rođenja: 1. januar 1990. godine"],
      ["01.01.1990.", "Rođen 1. januara 1990."],
    ])(
      "accepts date value %s against quote %s in another format",
      (value, quote) => {
        const [fact] = normalizeFacts(
          [raw({ field: "dateOfBirth", value, quote })],
          quote,
          "ID_CARD",
        );
        expect(fact.normalizedValue).toBe("1990-01-01");
      },
    );

    it("drops a date that differs from the one in the quote", () => {
      expect(
        normalizeFacts(
          [
            raw({
              field: "issuedDate",
              value: "02.01.1990.",
              quote: "Izdato: 01.01.1990.",
            }),
          ],
          "Izdato: 01.01.1990.",
          "ID_CARD",
        ),
      ).toEqual([]);
    });

    it("drops a date whose value cannot be parsed", () => {
      expect(
        normalizeFacts(
          [
            raw({
              field: "issuedDate",
              value: "juče",
              quote: "Izdato: 01.01.1990.",
            }),
          ],
          "Izdato: 01.01.1990.",
          "ID_CARD",
        ),
      ).toEqual([]);
    });
  });

  it("requires the identifier as one contiguous digit run in the quote", () => {
    const split = "JMBG: 1 0101990 710008";
    expect(
      normalizeFacts(
        [raw({ field: "jmbg", value: "0101990710008", quote: split })],
        split,
        "ID_CARD",
      ),
    ).toEqual([]);
    const glued = "JMBG: 10101990710008";
    expect(
      normalizeFacts(
        [raw({ field: "jmbg", value: "0101990710008", quote: glued })],
        glued,
        "ID_CARD",
      ),
    ).toEqual([]);
    const spaced = "JMBG: 0101990 710008.";
    expect(
      normalizeFacts(
        [raw({ field: "jmbg", value: "0101990710008", quote: spaced })],
        spaced,
        "ID_CARD",
      ),
    ).toHaveLength(1);
  });

  describe("month names", () => {
    const months: [string, string, string][] = [
      ["januara", "1", "01"],
      ["februara", "2", "02"],
      ["marta", "3", "03"],
      ["aprila", "4", "04"],
      ["maja", "5", "05"],
      ["juna", "6", "06"],
      ["jula", "7", "07"],
      ["avgusta", "8", "08"],
      ["septembra", "9", "09"],
      ["oktobra", "10", "10"],
      ["novembra", "11", "11"],
      ["decembra", "12", "12"],
      ["januar", "1", "01"],
      ["septembar", "9", "09"],
      ["oktobar", "10", "10"],
      ["novembar", "11", "11"],
      ["decembar", "12", "12"],
      ["mart", "3", "03"],
      ["maj", "5", "05"],
      ["jun", "6", "06"],
      ["jul", "7", "07"],
    ];

    it.each(months)("reads '%s' in a decision date", (name, _n, mm) => {
      const quote = `Doneto dana 15. ${name} 2026. godine`;
      const [fact] = normalizeFacts(
        [
          raw({
            subjectKey: "d1",
            subjectType: "DECISION",
            field: "decisionDate",
            value: `2026-${mm}-15`,
            quote,
          }),
        ],
        quote,
        "COURT_DECISION",
      );
      expect(fact?.normalizedValue).toBe(`2026-${mm}-15`);
    });

    it("reads capitalised and Cyrillic month names", () => {
      const quote = "Решење од 1. Октобра 1990. године";
      const [fact] = normalizeFacts(
        [
          raw({
            subjectKey: "d1",
            subjectType: "DECISION",
            field: "decisionDate",
            value: "01.10.1990.",
            quote,
          }),
        ],
        quote,
        "COURT_DECISION",
      );
      expect(fact?.normalizedValue).toBe("1990-10-01");
    });

    it("rejects the wrong month", () => {
      const quote = "Doneto 1. oktobra 1990.";
      expect(
        normalizeFacts(
          [
            raw({
              subjectKey: "d1",
              subjectType: "DECISION",
              field: "decisionDate",
              value: "1990-11-01",
              quote,
            }),
          ],
          quote,
          "COURT_DECISION",
        ),
      ).toEqual([]);
    });
  });
});
