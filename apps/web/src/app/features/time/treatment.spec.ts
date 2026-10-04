import { RetainerAgreement } from "@law/api-interfaces";
import {
  activeAgreementOn,
  agreementTerms,
  defaultTreatment,
} from "./treatment";

function agreement(
  overrides: Partial<RetainerAgreement> = {},
): RetainerAgreement {
  return {
    id: "a1",
    clientId: "c1",
    title: "Paušal",
    monthlyFee: "1000.00",
    currency: "EUR",
    validFrom: "2026-01-01",
    validTo: null,
    includedMinutes: null,
    coveredCategoryIds: [],
    overageRule: "HOURLY",
    overageHourlyRate: "100.00",
    outOfScopeRule: "AT",
    outOfScopeHourlyRate: null,
    active: true,
    ...overrides,
  };
}

describe("client-side treatment defaults", () => {
  const day = (value: string) => new Date(`${value}T00:00:00Z`);

  it("is undecided without an agreement on the work date", () => {
    const terms = agreementTerms([agreement({ validFrom: "2026-11-01" })]);
    expect(
      defaultTreatment(activeAgreementOn(terms, day("2026-10-04")), null),
    ).toBe("UNDECIDED");
  });

  it("is undecided for an invalid or missing work date", () => {
    const terms = agreementTerms([agreement()]);
    expect(activeAgreementOn(terms, new Date(""))).toBeNull();
    expect(
      defaultTreatment(activeAgreementOn(terms, new Date("T00:00:00Z")), null),
    ).toBe("UNDECIDED");
  });

  it("ignores inactive agreements and honours validTo", () => {
    const terms = agreementTerms([
      agreement({ active: false }),
      agreement({ id: "a2", validTo: "2026-02-01" }),
    ]);
    expect(activeAgreementOn(terms, day("2026-03-01"))).toBeNull();
    expect(activeAgreementOn(terms, day("2026-02-01"))).not.toBeNull();
  });

  it("is retainer when no categories are listed or the category is covered", () => {
    const open = activeAgreementOn(
      agreementTerms([agreement()]),
      day("2026-10-04"),
    );
    expect(defaultTreatment(open, null)).toBe("RETAINER");
    const covered = activeAgreementOn(
      agreementTerms([agreement({ coveredCategoryIds: ["cat-1"] })]),
      day("2026-10-04"),
    );
    expect(defaultTreatment(covered, "cat-1")).toBe("RETAINER");
  });

  it("applies the out-of-scope rule to uncovered categories", () => {
    const build = (outOfScopeRule: RetainerAgreement["outOfScopeRule"]) =>
      activeAgreementOn(
        agreementTerms([
          agreement({ coveredCategoryIds: ["cat-1"], outOfScopeRule }),
        ]),
        day("2026-10-04"),
      );
    expect(defaultTreatment(build("HOURLY"), "cat-2")).toBe("HOURLY");
    expect(defaultTreatment(build("AT"), null)).toBe("AT");
    expect(defaultTreatment(build("ABSORBED"), "cat-2")).toBe("RETAINER");
  });
});
