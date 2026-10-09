import {
  digitsOnly,
  isCalendarDate,
  isValidJmbg,
  isValidMb,
  isValidPib,
  jmbgBirthDate,
} from "./identifiers";
import { buildJmbg, buildPib } from "../testing/test-identifiers";

describe("digitsOnly", () => {
  it("strips non-digits", () => {
    expect(digitsOnly("01-01 990/71a")).toBe("0101990" + "71");
  });
});

describe("isValidJmbg", () => {
  it("accepts a JMBG with a correct control digit", () => {
    expect(isValidJmbg("0101990710008")).toBe(true);
    expect(isValidJmbg(buildJmbg("0101990"))).toBe(true);
    expect(isValidJmbg(buildJmbg("2902000"))).toBe(true);
    expect(isValidJmbg(buildJmbg("1503005", "80", "123"))).toBe(true);
  });

  it("accepts a control digit that comes out as 0 from m > 9", () => {
    let found = false;
    for (let serial = 0; serial < 1000 && !found; serial++) {
      const jmbg = buildJmbg("0101990", "71", String(serial).padStart(3, "0"));
      if (jmbg.endsWith("0")) {
        expect(isValidJmbg(jmbg)).toBe(true);
        found = true;
      }
    }
    expect(found).toBe(true);
  });

  it("rejects a changed digit", () => {
    const valid = buildJmbg("0101990");
    const control = Number(valid[12]);
    const tampered = `${valid.slice(0, 12)}${(control + 1) % 10}`;
    expect(isValidJmbg(tampered)).toBe(false);
  });

  it("rejects wrong length and non-digits", () => {
    expect(isValidJmbg(buildJmbg("0101990").slice(0, 12))).toBe(false);
    expect(isValidJmbg(`${buildJmbg("0101990")}1`)).toBe(false);
    expect(isValidJmbg("01019907100AB")).toBe(false);
  });

  it("rejects an impossible calendar date even with a valid control digit", () => {
    expect(isValidJmbg(buildJmbg("3102990"))).toBe(false);
    expect(isValidJmbg(buildJmbg("2902001"))).toBe(false);
  });
});

describe("jmbgBirthDate", () => {
  it("maps 990 to 1990", () => {
    expect(jmbgBirthDate(buildJmbg("0101990"))).toBe("1990-01-01");
  });

  it("maps 005 to 2005", () => {
    expect(jmbgBirthDate(buildJmbg("1503005"))).toBe("2005-03-15");
  });

  it("returns null for an invalid JMBG", () => {
    expect(jmbgBirthDate("1234567890123")).toBeNull();
    expect(jmbgBirthDate(buildJmbg("3102990"))).toBeNull();
  });
});

describe("isValidPib", () => {
  it("accepts a PIB with a correct check digit", () => {
    expect(isValidPib(buildPib("10000000"))).toBe(true);
    expect(isValidPib(buildPib("10123456"))).toBe(true);
    expect(isValidPib(buildPib("10234567"))).toBe(true);
  });

  it("accepts a known real PIB", () => {
    expect(isValidPib("101134702")).toBe(true);
  });

  it("rejects a changed check digit", () => {
    const valid = buildPib("10123456");
    const tampered = `${valid.slice(0, 8)}${(Number(valid[8]) + 1) % 10}`;
    expect(isValidPib(tampered)).toBe(false);
  });

  it("rejects wrong length and non-digits", () => {
    expect(isValidPib("12345678")).toBe(false);
    expect(isValidPib("10113470A")).toBe(false);
  });
});

describe("isValidMb", () => {
  it("accepts exactly 8 digits", () => {
    expect(isValidMb("12345678")).toBe(true);
  });

  it("rejects wrong length and letters", () => {
    expect(isValidMb("1234567")).toBe(false);
    expect(isValidMb("123456789")).toBe(false);
    expect(isValidMb("1234567a")).toBe(false);
  });
});

describe("isCalendarDate", () => {
  it("accepts real dates and rejects impossible ones", () => {
    expect(isCalendarDate(2024, 2, 29)).toBe(true);
    expect(isCalendarDate(2023, 2, 29)).toBe(false);
    expect(isCalendarDate(1990, 13, 1)).toBe(false);
  });
});
