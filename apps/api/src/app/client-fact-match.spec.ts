import {
  clientEmptyFillFields,
  matchClientFields,
  type ClientFieldSnapshot,
} from "@law/chat";

type Fact = {
  field: string;
  value: string;
  normalizedValue?: string | null;
  quote?: string;
};

function person(overrides: Partial<ClientFieldSnapshot> = {}) {
  return {
    type: "INDIVIDUAL",
    firstName: "Petar",
    lastName: "Petrović",
    jmbg: null,
    registrationNumber: null,
    taxNumber: null,
    addressCount: 1,
    identificationNumbers: [],
    ...overrides,
  } as ClientFieldSnapshot;
}

function company(overrides: Partial<ClientFieldSnapshot> = {}) {
  return person({
    type: "ORGANIZATION",
    firstName: null,
    lastName: null,
    ...overrides,
  });
}

function subject(subjectType: string, facts: Fact[], documentKind = "ID_CARD") {
  return {
    subjectType,
    documentKind,
    facts: facts.map((fact) => ({
      field: fact.field,
      value: fact.value,
      normalizedValue: fact.normalizedValue ?? null,
      quote: fact.quote ?? `${fact.field}: ${fact.value}`,
    })),
  };
}

const JMBG = "0101990710006";

describe("matchClientFields", () => {
  it("matches a person by name regardless of case, diacritics, script and order", () => {
    const result = matchClientFields(
      person(),
      subject("PERSON", [{ field: "fullName", value: "PETROVIC petar" }]),
    );
    expect(result.matched).toBe(true);
    const cyrillic = matchClientFields(
      person(),
      subject("PERSON", [
        { field: "firstName", value: "Петар" },
        { field: "lastName", value: "Петровић" },
      ]),
    );
    expect(cyrillic.matched).toBe(true);
  });

  it("does not match another person (the opposing party)", () => {
    const result = matchClientFields(
      person(),
      subject("PERSON", [
        { field: "fullName", value: "Marko Marković" },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
      ]),
    );
    expect(result).toEqual({ matched: false, fill: [], conflicts: [] });
  });

  it("matches by an existing JMBG even when the name differs", () => {
    const result = matchClientFields(
      person({ jmbg: JMBG }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrovic-Njegos" },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
      ]),
    );
    expect(result.matched).toBe(true);
  });

  it("proposes an empty jmbg", () => {
    const result = matchClientFields(
      person({ jmbg: null }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        {
          field: "jmbg",
          value: "0101990 710006",
          normalizedValue: JMBG,
          quote: "JMBG 0101990710006",
        },
      ]),
    );
    expect(result.matched).toBe(true);
    expect(result.fill).toEqual([
      { field: "jmbg", value: JMBG, quote: "JMBG 0101990710006" },
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("reports a different existing jmbg as a conflict and fills nothing", () => {
    const result = matchClientFields(
      person({ jmbg: "1212985710008" }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
        { field: "address", value: "Kneza Miloša 10, 11000 Beograd" },
      ]),
    );
    expect(result.conflicts).toEqual([
      { field: "jmbg", current: "1212985710008", found: JMBG },
    ]);
    expect(result.fill).toEqual([]);
    expect(result.matched).toBe(false);
  });

  it("never fills a field the client already has", () => {
    const result = matchClientFields(
      person({ jmbg: JMBG, addressCount: 1 }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
        { field: "address", value: "Kneza Miloša 10, 11000 Beograd" },
      ]),
    );
    expect(result.matched).toBe(true);
    expect(result.fill).toEqual([]);
    expect(result.conflicts).toEqual([]);
  });

  it("fills empty first and last name when matched by jmbg, in title case", () => {
    const result = matchClientFields(
      person({ firstName: null, lastName: null, jmbg: JMBG }),
      subject("PERSON", [
        { field: "firstName", value: "PETAR", quote: "Ime PETAR" },
        {
          field: "lastName",
          value: "PETROVIĆ-JOVANOVIĆ",
          quote: "PETROVIĆ-JOVANOVIĆ",
        },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
      ]),
    );
    expect(result.matched).toBe(true);
    expect(result.fill).toEqual([
      { field: "firstName", value: "Petar", quote: "Ime PETAR" },
      {
        field: "lastName",
        value: "Petrović-Jovanović",
        quote: "PETROVIĆ-JOVANOVIĆ",
      },
    ]);
  });

  it("proposes the address only when the client has none, and parses it", () => {
    const facts = [
      { field: "fullName", value: "Petar Petrović" },
      {
        field: "address",
        value: "Kneza Miloša 10, 11000 Beograd",
        quote: "Adresa: Kneza Miloša 10, 11000 Beograd",
      },
    ];
    const withAddress = matchClientFields(
      person({ addressCount: 1 }),
      subject("PERSON", facts),
    );
    expect(withAddress.fill).toEqual([]);

    const without = matchClientFields(
      person({ addressCount: 0 }),
      subject("PERSON", facts),
    );
    expect(without.fill).toEqual([
      {
        field: "address",
        value: "Kneza Miloša 10, 11000 Beograd",
        quote: "Adresa: Kneza Miloša 10, 11000 Beograd",
        address: {
          addressType: "REGISTERED",
          street: "Kneza Miloša 10",
          city: "Beograd",
          postalCode: "11000",
          country: "RS",
        },
      },
    ]);
  });

  it.each([
    ["Kneza Miloša 10", "no city and postal code"],
    ["Kneza Miloša 10, Beograd", "no postal code"],
    ["11000 Beograd", "no street"],
  ])(
    "does not propose an address it cannot fill honestly (%s: %s)",
    (value) => {
      const result = matchClientFields(
        person({ addressCount: 0 }),
        subject("PERSON", [
          { field: "fullName", value: "Petar Petrović" },
          { field: "address", value },
        ]),
      );
      expect(result.matched).toBe(true);
      expect(result.fill).toEqual([]);
    },
  );

  it("parses city before postal code and postal code first", () => {
    const a = matchClientFields(
      person({ addressCount: 0 }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "address", value: "Bulevar 5, Novi Sad 21000" },
      ]),
    );
    expect(a.fill[0].address).toMatchObject({
      street: "Bulevar 5",
      city: "Novi Sad",
      postalCode: "21000",
    });
    const b = matchClientFields(
      person({ addressCount: 0 }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "address", value: "21000 Novi Sad, Bulevar 5" },
      ]),
    );
    expect(b.fill[0].address).toMatchObject({
      street: "Bulevar 5",
      city: "Novi Sad",
      postalCode: "21000",
    });
  });

  it("maps an ID card to LICNA_KARTA and a passport to PASSPORT", () => {
    const facts = [
      { field: "fullName", value: "Petar Petrović" },
      {
        field: "documentNumber",
        value: "012345678",
        quote: "Br. 012345678",
      },
      {
        field: "issuedDate",
        value: "01.02.2020.",
        normalizedValue: "2020-02-01",
      },
      {
        field: "expiryDate",
        value: "01.02.2030.",
        normalizedValue: "2030-02-01",
      },
    ];
    const card = matchClientFields(
      person(),
      subject("PERSON", facts, "ID_CARD"),
    );
    expect(card.fill).toEqual([
      {
        field: "identificationDocument",
        value: "012345678",
        quote: "Br. 012345678",
        identificationDocument: {
          type: "LICNA_KARTA",
          number: "012345678",
          issuedDate: "2020-02-01",
          expiredDate: "2030-02-01",
          country: "RS",
        },
      },
    ]);
    const passport = matchClientFields(
      person(),
      subject("PERSON", facts, "PASSPORT"),
    );
    expect(passport.fill[0].identificationDocument?.type).toBe("PASSPORT");
  });

  it("uses the nationality when it clearly names another country", () => {
    const result = matchClientFields(
      person(),
      subject(
        "PERSON",
        [
          { field: "fullName", value: "Petar Petrović" },
          { field: "documentNumber", value: "P1234567" },
          { field: "nationality", value: "Hrvatsko" },
        ],
        "PASSPORT",
      ),
    );
    expect(result.fill[0].identificationDocument?.country).toBe("HR");
  });

  it("skips an identification document the client already has (by number)", () => {
    const result = matchClientFields(
      person({ identificationNumbers: ["012 345 678"] }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "documentNumber", value: "012345678" },
      ]),
    );
    expect(result.fill).toEqual([]);
  });

  it("does not match a person subject to a company client and vice versa", () => {
    const asPerson = matchClientFields(
      company({ registrationNumber: "12345678" }),
      subject("PERSON", [
        { field: "fullName", value: "Petar Petrović" },
        { field: "jmbg", value: JMBG, normalizedValue: JMBG },
      ]),
    );
    expect(asPerson.matched).toBe(false);
    const asCompany = matchClientFields(
      person(),
      subject(
        "COMPANY",
        [{ field: "registrationNumber", value: "12345678" }],
        "APR_EXCERPT",
      ),
    );
    expect(asCompany.matched).toBe(false);
  });

  it("matches a company by registration or tax number, never by name", () => {
    const byName = matchClientFields(
      company({ registrationNumber: null, taxNumber: null }),
      subject(
        "COMPANY",
        [
          { field: "companyName", value: "Primer d.o.o." },
          {
            field: "registrationNumber",
            value: "12345678",
            normalizedValue: "12345678",
          },
        ],
        "APR_EXCERPT",
      ),
    );
    expect(byName.matched).toBe(false);

    const byMb = matchClientFields(
      company({ registrationNumber: "12345678" }),
      subject(
        "COMPANY",
        [
          {
            field: "registrationNumber",
            value: "12345678",
            normalizedValue: "12345678",
          },
          {
            field: "taxNumber",
            value: "100000001",
            normalizedValue: "100000001",
            quote: "PIB 100000001",
          },
          { field: "seatAddress", value: "Bulevar 5, 11000 Beograd" },
        ],
        "APR_EXCERPT",
      ),
    );
    expect(byMb.matched).toBe(true);
    expect(byMb.fill.map((item) => item.field)).toEqual(["taxNumber"]);

    const byPib = matchClientFields(
      company({ taxNumber: "100000001", addressCount: 0 }),
      subject(
        "COMPANY",
        [
          {
            field: "registrationNumber",
            value: "12 345 678",
            normalizedValue: "12345678",
          },
          {
            field: "taxNumber",
            value: "100000001",
            normalizedValue: "100000001",
          },
          { field: "seatAddress", value: "Bulevar 5, 11000 Beograd" },
        ],
        "APR_EXCERPT",
      ),
    );
    expect(byPib.matched).toBe(true);
    expect(byPib.fill.map((item) => item.field)).toEqual([
      "registrationNumber",
      "address",
    ]);
  });

  it("does not match a company when its identifiers disagree", () => {
    const result = matchClientFields(
      company({ registrationNumber: "12345678", taxNumber: "100000001" }),
      subject(
        "COMPANY",
        [
          {
            field: "registrationNumber",
            value: "12345678",
            normalizedValue: "12345678",
          },
          {
            field: "taxNumber",
            value: "100000002",
            normalizedValue: "100000002",
          },
        ],
        "APR_EXCERPT",
      ),
    );
    expect(result.matched).toBe(false);
    expect(result.conflicts).toEqual([
      { field: "taxNumber", current: "100000001", found: "100000002" },
    ]);
  });

  it("never matches a decision subject", () => {
    expect(
      matchClientFields(
        person(),
        subject(
          "DECISION",
          [{ field: "caseNumber", value: "P 1/2026" }],
          "COURT_DECISION",
        ),
      ).matched,
    ).toBe(false);
  });
});

describe("clientEmptyFillFields", () => {
  it("lists what a person could still receive", () => {
    expect(
      clientEmptyFillFields(
        person({ addressCount: 0, identificationNumbers: [] }),
      ),
    ).toEqual(["jmbg", "address", "identificationDocument"]);
    expect(
      clientEmptyFillFields(
        person({
          jmbg: JMBG,
          addressCount: 1,
          identificationNumbers: ["1"],
        }),
      ),
    ).toEqual([]);
  });

  it("lists what a company could still receive", () => {
    expect(clientEmptyFillFields(company({ addressCount: 1 }))).toEqual([
      "registrationNumber",
      "taxNumber",
    ]);
  });
});
