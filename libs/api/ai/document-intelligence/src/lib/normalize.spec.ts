import { buildJmbgForTest, buildPibForTest } from "./test-identifiers";
import { normalizeFacts, type RawFact } from "./normalize";

const JMBG = buildJmbgForTest("0101990");
const OTHER_JMBG = buildJmbgForTest("0202985");
const PIB = buildPibForTest("10000001");

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
});
