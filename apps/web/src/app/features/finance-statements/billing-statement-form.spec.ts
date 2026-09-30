import { FormArray } from "@angular/forms";
import {
  BillableWorkItem,
  BillingStatementLineSummary,
} from "@law/api-interfaces";
import {
  appendUniqueBillableWork,
  BillingStatementLineForm,
  calculateBillingStatementLineAmounts,
  calculateBillingStatementTotals,
  createBillableWorkLineForm,
  createBillingStatementLineForm,
  detachBillingStatementLineSources,
  incompatibleCurrencyIndexes,
  normalizeCurrency,
} from "./billing-statement-form";

const sourceItem: BillableWorkItem = {
  sourceKey: "EVENT:44444444-4444-4444-8444-444444444444",
  sourceType: "EVENT",
  sourceId: "44444444-4444-4444-8444-444444444444",
  title: "Zastupanje na ročištu",
  date: "2026-09-29T08:00:00.000Z",
  client: {
    id: "22222222-2222-4222-8222-222222222222",
    clientNumber: "KL-1",
    displayName: "Klijent",
    type: "INDIVIDUAL",
    status: "ACTIVE",
  },
  case: null,
  responsibleUser: {
    id: "33333333-3333-4333-8333-333333333333",
    displayName: "Advokat",
    email: null,
  },
};

const savedLine: BillingStatementLineSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  statementId: "55555555-5555-4555-8555-555555555555",
  client: sourceItem.client,
  cases: [],
  performedBy: sourceItem.responsibleUser,
  lineOrder: 0,
  description: sourceItem.title,
  serviceDate: "2026-09-29",
  netAmount: "12000.00",
  vatRate: "20.00",
  vatAmount: "2400.00",
  grossAmount: "14400.00",
  currency: "RSD",
  status: "RESERVED",
  sourceType: sourceItem.sourceType,
  sourceId: sourceItem.sourceId,
  billedAt: null,
  cancelledAt: null,
  cancellationReason: null,
};

describe("billing statement form helpers", () => {
  it("maps a saved statement line to an editable row", () => {
    expect(createBillingStatementLineForm(savedLine).getRawValue()).toEqual({
      sourceType: "EVENT",
      sourceId: sourceItem.sourceId,
      serviceDate: "2026-09-29",
      description: sourceItem.title,
      netAmount: 12000,
      vatRate: 20,
      vatAmount: 2400,
      grossAmount: 14400,
      currency: "RSD",
    });
  });

  it("creates a source-backed row with the amount left for the user", () => {
    expect(createBillableWorkLineForm(sourceItem, "RSD").getRawValue()).toEqual(
      {
        sourceType: "EVENT",
        sourceId: sourceItem.sourceId,
        serviceDate: "2026-09-29",
        description: sourceItem.title,
        netAmount: null,
        vatRate: 0,
        vatAmount: 0,
        grossAmount: null,
        currency: "RSD",
      },
    );
  });

  it("detaches a source without clearing entered values", () => {
    const form = createBillableWorkLineForm(sourceItem, "RSD");
    form.controls.netAmount.setValue(12000);
    form.controls.vatRate.setValue(20);
    form.controls.vatAmount.setValue(2400);
    form.controls.grossAmount.setValue(14400);
    detachBillingStatementLineSources([form]);

    expect(form.controls.sourceType.value).toBeNull();
    expect(form.controls.sourceId.value).toBeNull();
    expect(form.controls.description.value).toBe(sourceItem.title);
    expect(form.controls.netAmount.value).toBe(12000);
    expect(form.controls.vatRate.value).toBe(20);
    expect(form.controls.vatAmount.value).toBe(2400);
    expect(form.controls.grossAmount.value).toBe(14400);
  });

  it("identifies only rows whose currency differs from the statement", () => {
    const matching = createBillableWorkLineForm(sourceItem, "RSD");
    const mismatching = createBillableWorkLineForm(
      {
        ...sourceItem,
        sourceKey: "TASK:other",
        sourceType: "TASK",
        sourceId: "other",
      },
      "EUR",
    );

    expect(incompatibleCurrencyIndexes([matching, mismatching], "rsd")).toEqual(
      [1],
    );
    expect(normalizeCurrency(" eur ")).toBe("EUR");
  });

  it("does not append the same work source twice", () => {
    const lines = new FormArray<BillingStatementLineForm>([]);

    expect(appendUniqueBillableWork(lines, [sourceItem], "RSD")).toBe(1);
    expect(appendUniqueBillableWork(lines, [sourceItem], "RSD")).toBe(0);
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
