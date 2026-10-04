import { FormArray } from "@angular/forms";
import { BillingStatementLineSummary, WorkEntry } from "@law/api-interfaces";
import {
  appendUniqueWorkEntries,
  BillingStatementLineForm,
  calculateBillingStatementLineAmounts,
  calculateBillingStatementTotals,
  createBillingStatementLineForm,
  createWorkEntryLineForm,
  detachBillingStatementLineWorkEntries,
  hasPricingRequiredLines,
  incompatibleCurrencyIndexes,
  normalizeCurrency,
  recalculateBillingStatementLine,
  toBillingStatementLineInput,
} from "./billing-statement-form";

const client = {
  id: "22222222-2222-4222-8222-222222222222",
  clientNumber: "KL-1",
  displayName: "Klijent",
  type: "INDIVIDUAL" as const,
  status: "ACTIVE" as const,
};
const user = {
  id: "33333333-3333-4333-8333-333333333333",
  displayName: "Advokat",
  email: null,
};

function entry(overrides: Partial<WorkEntry> = {}): WorkEntry {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    user,
    client,
    case: null,
    workDate: "2026-09-29",
    minutes: 90,
    timerStartedAt: null,
    description: "Zastupanje na ročištu",
    serviceCategory: null,
    treatment: "HOURLY",
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    statementId: null,
    aiParsed: false,
    createdAt: "2026-09-29T08:00:00.000Z",
    updatedAt: "2026-09-29T08:00:00.000Z",
    ...overrides,
  };
}

const rate = { hourlyRate: "8000.00", currency: "RSD" };

const savedLine: BillingStatementLineSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  statementId: "55555555-5555-4555-8555-555555555555",
  client,
  cases: [],
  performedBy: user,
  lineOrder: 0,
  description: "Zastupanje na ročištu (1 h 30 min)",
  serviceDate: "2026-09-29",
  netAmount: "12000.00",
  vatRate: "20.00",
  vatAmount: "2400.00",
  grossAmount: "14400.00",
  currency: "RSD",
  status: "RESERVED",
  sourceType: "WORK_ENTRY_GROUP",
  sourceId: null,
  pricingRequired: false,
  minutes: 90,
  workEntries: [
    {
      id: "44444444-4444-4444-8444-444444444444",
      workDate: "2026-09-29",
      user,
      description: "Zastupanje na ročištu",
      minutes: 90,
    },
  ],
  billedAt: null,
  cancelledAt: null,
  cancellationReason: null,
};

describe("billing statement form helpers", () => {
  it("maps a saved statement line to an editable row", () => {
    expect(createBillingStatementLineForm(savedLine).getRawValue()).toEqual({
      id: "11111111-1111-4111-8111-111111111111",
      workEntryIds: ["44444444-4444-4444-8444-444444444444"],
      minutes: 90,
      pricingRequired: false,
      serviceDate: "2026-09-29",
      description: "Zastupanje na ročištu (1 h 30 min)",
      netAmount: 12000,
      vatRate: 20,
      vatAmount: 2400,
      grossAmount: 14400,
      currency: "RSD",
    });
  });

  it("prices an HOURLY entry at the client rate in the statement currency", () => {
    const form = createWorkEntryLineForm(entry(), "RSD", rate);

    expect(form.getRawValue()).toEqual({
      id: null,
      workEntryIds: ["44444444-4444-4444-8444-444444444444"],
      minutes: 90,
      pricingRequired: false,
      serviceDate: "2026-09-29",
      description: "Zastupanje na ročištu (1 h 30 min)",
      netAmount: 12000,
      vatRate: 0,
      vatAmount: 0,
      grossAmount: 12000,
      currency: "RSD",
    });
    expect(form.valid).toBe(true);
  });

  it("flags a non-HOURLY entry for pricing instead of guessing", () => {
    const form = createWorkEntryLineForm(
      entry({ treatment: "AT", minutes: 45 }),
      "RSD",
      rate,
    );

    expect(form.controls.netAmount.value).toBe(0);
    expect(form.controls.pricingRequired.value).toBe(true);
    expect(form.controls.description.value).toBe(
      "Zastupanje na ročištu (0 h 45 min)",
    );
    // A flagged line may stay unpriced until it is sent.
    expect(form.valid).toBe(true);
  });

  it("flags an HOURLY entry when the rate is missing or in another currency", () => {
    expect(
      createWorkEntryLineForm(entry(), "RSD", null).controls.pricingRequired
        .value,
    ).toBe(true);
    expect(
      createWorkEntryLineForm(entry(), "RSD", {
        hourlyRate: null,
        currency: "RSD",
      }).controls.pricingRequired.value,
    ).toBe(true);
    const foreign = createWorkEntryLineForm(entry(), "RSD", {
      hourlyRate: "100.00",
      currency: "EUR",
    });
    expect(foreign.controls.pricingRequired.value).toBe(true);
    expect(foreign.controls.netAmount.value).toBe(0);
  });

  it("clears pricingRequired when the amount on a flagged row becomes positive", () => {
    const form = createWorkEntryLineForm(
      entry({ treatment: "AT" }),
      "RSD",
      rate,
    );
    expect(hasPricingRequiredLines([form.getRawValue()])).toBe(true);

    form.controls.netAmount.setValue(5000);
    recalculateBillingStatementLine(form, "netAmount");

    expect(form.controls.pricingRequired.value).toBe(false);
    expect(form.controls.grossAmount.value).toBe(5000);
    expect(hasPricingRequiredLines([form.getRawValue()])).toBe(false);
  });

  it("keeps the flag while the amount stays at zero", () => {
    const form = createWorkEntryLineForm(
      entry({ treatment: "AT" }),
      "RSD",
      rate,
    );
    form.controls.netAmount.setValue(0);
    recalculateBillingStatementLine(form, "netAmount");

    expect(form.controls.pricingRequired.value).toBe(true);
  });

  it("requires a positive amount on a line that is not flagged", () => {
    const form = createBillingStatementLineForm(undefined, "RSD");
    form.patchValue({ description: "Ručni red", netAmount: 0, grossAmount: 0 });
    expect(form.valid).toBe(false);

    form.controls.netAmount.setValue(100);
    expect(form.valid).toBe(true);
  });

  it("blocks sending while any row is flagged", () => {
    const flagged = { pricingRequired: true };
    const priced = { pricingRequired: false };

    expect(hasPricingRequiredLines([priced, flagged])).toBe(true);
    expect(hasPricingRequiredLines([priced])).toBe(false);
    expect(hasPricingRequiredLines([])).toBe(false);
  });

  it("builds the line request with entry ids, minutes and the flag", () => {
    const flagged = createWorkEntryLineForm(
      entry({ treatment: "AT" }),
      "rsd",
      rate,
    );
    expect(toBillingStatementLineInput(flagged)).toEqual({
      serviceDate: "2026-09-29",
      description: "Zastupanje na ročištu (1 h 30 min)",
      netAmount: 0,
      vatRate: 0,
      vatAmount: 0,
      grossAmount: 0,
      currency: "RSD",
      workEntryIds: ["44444444-4444-4444-8444-444444444444"],
      minutes: 90,
      pricingRequired: true,
    });

    const manual = createBillingStatementLineForm(undefined, "RSD");
    manual.patchValue({ description: " Ručni red ", netAmount: 10 });
    expect(toBillingStatementLineInput(manual)).toEqual(
      expect.not.objectContaining({ workEntryIds: expect.anything() }),
    );
  });

  it("keeps the saved line id through an edit and sends it on save", () => {
    const form = createBillingStatementLineForm(savedLine);
    form.patchValue({ description: "Korigovano", netAmount: 10 });

    expect(toBillingStatementLineInput(form)).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      description: "Korigovano",
      netAmount: 10,
    });
  });

  it("sends no id for new manual or work-entry lines", () => {
    const manual = createBillingStatementLineForm(undefined, "RSD");
    manual.patchValue({ description: "Novi red", netAmount: 10 });
    const imported = createWorkEntryLineForm(entry(), "RSD", rate);

    expect(toBillingStatementLineInput(manual)).not.toHaveProperty("id");
    expect(toBillingStatementLineInput(imported)).not.toHaveProperty("id");
  });

  it("detaches work entries without clearing entered values", () => {
    const form = createWorkEntryLineForm(entry(), "RSD", rate);
    form.controls.netAmount.setValue(9000);
    detachBillingStatementLineWorkEntries([form]);

    expect(form.controls.workEntryIds.value).toEqual([]);
    expect(form.controls.minutes.value).toBeNull();
    expect(form.controls.description.value).toBe(
      "Zastupanje na ročištu (1 h 30 min)",
    );
    expect(form.controls.netAmount.value).toBe(9000);
  });

  it("identifies only rows whose currency differs from the statement", () => {
    const matching = createWorkEntryLineForm(entry(), "RSD", rate);
    const mismatching = createWorkEntryLineForm(
      entry({ id: "other" }),
      "EUR",
      rate,
    );

    expect(incompatibleCurrencyIndexes([matching, mismatching], "rsd")).toEqual(
      [1],
    );
    expect(normalizeCurrency(" eur ")).toBe("EUR");
  });

  it("does not append the same work entry twice", () => {
    const lines = new FormArray<BillingStatementLineForm>([]);

    expect(appendUniqueWorkEntries(lines, [entry()], "RSD", rate)).toBe(1);
    expect(appendUniqueWorkEntries(lines, [entry()], "RSD", rate)).toBe(0);
    expect(lines.length).toBe(1);
  });

  it("recalculates VAT and gross when net or VAT rate changes", () => {
    expect(
      calculateBillingStatementLineAmounts("netAmount", {
        netAmount: 2323,
        vatRate: 22,
      }),
    ).toEqual({
      netAmount: 2323,
      vatRate: 22,
      vatAmount: 511.06,
      grossAmount: 2834.06,
    });

    expect(
      calculateBillingStatementLineAmounts("vatRate", {
        netAmount: 100,
        vatRate: 20,
      }),
    ).toEqual({
      netAmount: 100,
      vatRate: 20,
      vatAmount: 20,
      grossAmount: 120,
    });
  });

  it("derives VAT rate from a manually changed VAT amount", () => {
    expect(
      calculateBillingStatementLineAmounts("vatAmount", {
        netAmount: 200,
        vatAmount: 35,
      }),
    ).toEqual({
      netAmount: 200,
      vatRate: 17.5,
      vatAmount: 35,
      grossAmount: 235,
    });
  });

  it("derives net and VAT from a manually changed gross amount", () => {
    expect(
      calculateBillingStatementLineAmounts("grossAmount", {
        vatRate: 22,
        grossAmount: 2834.06,
      }),
    ).toEqual({
      netAmount: 2323,
      vatRate: 22,
      vatAmount: 511.06,
      grossAmount: 2834.06,
    });
  });

  it("normalizes invalid values and handles VAT derivation from zero net", () => {
    expect(
      calculateBillingStatementLineAmounts("vatAmount", {
        netAmount: 0,
        vatAmount: 100,
      }),
    ).toEqual({
      netAmount: 0,
      vatRate: 0,
      vatAmount: 0,
      grossAmount: 0,
    });
    expect(
      calculateBillingStatementLineAmounts("netAmount", {
        netAmount: Number.NaN,
        vatRate: Number.POSITIVE_INFINITY,
      }),
    ).toEqual({
      netAmount: 0,
      vatRate: 0,
      vatAmount: 0,
      grossAmount: 0,
    });
  });

  it("derives rounded statement totals from row net and VAT amounts", () => {
    expect(
      calculateBillingStatementTotals([
        { netAmount: 2323, vatAmount: 511.06 },
        { netAmount: 1000.1, vatAmount: 200.02 },
        { netAmount: Number.NaN, vatAmount: -5 },
      ]),
    ).toEqual({
      netAmount: 3323.1,
      vatAmount: 711.08,
      grossAmount: 4034.18,
    });
  });
});
