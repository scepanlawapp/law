import {
  billingEntryValidationKey,
  toDateInputValue,
} from "./billing-entry-dialog.utils";

describe("billing entry dialog utilities", () => {
  it("normalizes a candidate timestamp for a date input", () => {
    expect(toDateInputValue("2026-09-28T14:30:00.000Z")).toBe("2026-09-28");
  });

  it("uses the local calendar date when no candidate date is available", () => {
    expect(toDateInputValue(undefined, new Date(2026, 8, 7, 23, 30))).toBe(
      "2026-09-07",
    );
  });

  it("requires a positive duration for time work", () => {
    expect(
      billingEntryValidationKey({
        kind: "TIME",
        workStartDate: "2026-09-23",
        workEndDate: "2026-09-23",
        durationMinutes: null,
        amount: 100,
        disposition: "BILLABLE",
        noChargeReason: "",
      }),
    ).toBe("finance.positiveDuration");
  });

  it("requires a positive amount for billable work", () => {
    expect(
      billingEntryValidationKey({
        kind: "FIXED_FEE",
        workStartDate: "2026-09-23",
        workEndDate: "2026-09-23",
        durationMinutes: null,
        amount: 0,
        disposition: "BILLABLE",
        noChargeReason: "",
      }),
    ).toBe("finance.billableAmount");
  });

  it("requires a reason and zero amount for included work", () => {
    expect(
      billingEntryValidationKey({
        kind: "FIXED_FEE",
        workStartDate: "2026-09-23",
        workEndDate: "2026-09-23",
        durationMinutes: null,
        amount: 0,
        disposition: "INCLUDED",
        noChargeReason: "",
      }),
    ).toBe("finance.zeroAmountReason");
  });

  it("accepts a valid zero-charge entry", () => {
    expect(
      billingEntryValidationKey({
        kind: "FIXED_FEE",
        workStartDate: "2026-09-23",
        workEndDate: "2026-09-23",
        durationMinutes: null,
        amount: 0,
        disposition: "NO_CHARGE",
        noChargeReason: "Courtesy adjustment",
      }),
    ).toBeNull();
  });

  it("rejects a work period whose end precedes its start", () => {
    expect(
      billingEntryValidationKey({
        kind: "FIXED_FEE",
        workStartDate: "2026-09-25",
        workEndDate: "2026-09-23",
        durationMinutes: null,
        amount: 100,
        disposition: "BILLABLE",
        noChargeReason: "",
      }),
    ).toBe("finance.invalidWorkPeriod");
  });
});
