import { FormArray } from "@angular/forms";
import {
  BillableWorkItem,
  BillingStatementLineSummary,
} from "@law/api-interfaces";
import {
  appendUniqueBillableWork,
  BillingStatementLineForm,
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
});
