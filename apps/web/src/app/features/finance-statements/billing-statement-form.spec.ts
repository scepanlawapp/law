import { BillingStatementLineSummary } from "@law/api-interfaces";
import { FormArray } from "@angular/forms";
import {
  appendUniqueBillingStatementLines,
  BillingStatementLineForm,
  createBillingStatementLineForm,
  detachBillingStatementLineSources,
  incompatibleCurrencyIndexes,
  normalizeCurrency,
} from "./billing-statement-form";

const importedLine: BillingStatementLineSummary = {
  id: "11111111-1111-4111-8111-111111111111",
  statementId: null,
  client: {
    id: "22222222-2222-4222-8222-222222222222",
    clientNumber: "KL-1",
    displayName: "Klijent",
    type: "INDIVIDUAL",
    status: "ACTIVE",
  },
  cases: [],
  performedBy: {
    id: "33333333-3333-4333-8333-333333333333",
    displayName: "Advokat",
    email: null,
  },
  lineOrder: null,
  description: "Zastupanje na ročištu",
  serviceDate: "2026-09-29",
  amount: "12000.00",
  currency: "RSD",
  status: "UNBILLED",
  sourceType: "EVENT",
  sourceId: "44444444-4444-4444-8444-444444444444",
  billedAt: null,
  cancelledAt: null,
  cancellationReason: null,
};

describe("billing statement form helpers", () => {
  it("maps an imported line using the existing API field names", () => {
    const form = createBillingStatementLineForm(importedLine);

    expect(form.getRawValue()).toEqual({
      id: importedLine.id,
      performedByUserId: importedLine.performedBy.id,
      serviceDate: importedLine.serviceDate,
      description: importedLine.description,
      amount: 12000,
      currency: "RSD",
    });
  });

  it("detaches imported ids without clearing entered line values", () => {
    const form = createBillingStatementLineForm(importedLine);
    form.controls.description.setValue("Izmenjen opis");

    detachBillingStatementLineSources([form]);

    expect(form.controls.id.value).toBeNull();
    expect(form.controls.description.value).toBe("Izmenjen opis");
    expect(form.controls.amount.value).toBe(12000);
    expect(form.controls.serviceDate.value).toBe("2026-09-29");
  });

  it("identifies only rows whose currency differs from the statement", () => {
    const matching = createBillingStatementLineForm(importedLine);
    const mismatching = createBillingStatementLineForm({
      ...importedLine,
      id: "55555555-5555-4555-8555-555555555555",
      currency: "EUR",
    });

    expect(incompatibleCurrencyIndexes([matching, mismatching], "rsd")).toEqual(
      [1],
    );
    expect(normalizeCurrency(" eur ")).toBe("EUR");
  });

  it("does not append the same imported line twice", () => {
    const lines = new FormArray<BillingStatementLineForm>([]);

    expect(appendUniqueBillingStatementLines(lines, [importedLine])).toBe(1);
    expect(appendUniqueBillingStatementLines(lines, [importedLine])).toBe(0);
    expect(lines.length).toBe(1);
  });
});
