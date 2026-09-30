import { FormArray, FormControl, FormGroup, Validators } from "@angular/forms";
import {
  BillableWorkItem,
  BillableWorkSourceType,
  BillingStatementLineSummary,
} from "@law/api-interfaces";

export type BillingStatementLineForm = FormGroup<{
  sourceType: FormControl<BillableWorkSourceType | null>;
  sourceId: FormControl<string | null>;
  serviceDate: FormControl<string>;
  description: FormControl<string>;
  netAmount: FormControl<number | null>;
  vatRate: FormControl<number | null>;
  vatAmount: FormControl<number | null>;
  grossAmount: FormControl<number | null>;
  currency: FormControl<string>;
}>;

export function createBillingStatementLineForm(
  line?: BillingStatementLineSummary,
  defaultCurrency = "RSD",
): BillingStatementLineForm {
  return new FormGroup({
    sourceType: new FormControl<BillableWorkSourceType | null>(
      isBillableWorkSourceType(line?.sourceType) ? line.sourceType : null,
    ),
    sourceId: new FormControl(line?.sourceId ?? null),
    serviceDate: new FormControl(
      line?.serviceDate.slice(0, 10) ?? localDate(),
      {
        nonNullable: true,
        validators: Validators.required,
      },
    ),
    description: new FormControl(line?.description ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10_000)],
    }),
    netAmount: new FormControl<number | null>(
      line ? Number(line.netAmount) : null,
      [Validators.required, Validators.min(0.01)],
    ),
    vatRate: new FormControl<number | null>(line ? Number(line.vatRate) : 0, [
      Validators.required,
      Validators.min(0),
      Validators.max(100),
    ]),
    vatAmount: new FormControl<number | null>(
      line ? Number(line.vatAmount) : 0,
      [Validators.required, Validators.min(0)],
    ),
    grossAmount: new FormControl<number | null>(
      line ? Number(line.grossAmount) : null,
      [Validators.required, Validators.min(0.01)],
    ),
    currency: new FormControl(line?.currency ?? defaultCurrency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
  });
}

export function createBillableWorkLineForm(
  item: BillableWorkItem,
  currency: string,
): BillingStatementLineForm {
  return new FormGroup({
    sourceType: new FormControl<BillableWorkSourceType | null>(item.sourceType),
    sourceId: new FormControl(item.sourceId),
    serviceDate: new FormControl(item.date.slice(0, 10), {
      nonNullable: true,
      validators: Validators.required,
    }),
    description: new FormControl(item.title, {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10_000)],
    }),
    netAmount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    vatRate: new FormControl<number | null>(0, [
      Validators.required,
      Validators.min(0),
      Validators.max(100),
    ]),
    vatAmount: new FormControl<number | null>(0, [
      Validators.required,
      Validators.min(0),
    ]),
    grossAmount: new FormControl<number | null>(null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    currency: new FormControl(currency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
  });
}

export function detachBillingStatementLineSources(
  lines: readonly BillingStatementLineForm[],
): void {
  for (const line of lines) {
    if (!line.controls.sourceId.value) continue;
    line.controls.sourceType.setValue(null);
    line.controls.sourceId.setValue(null);
    line.markAsDirty();
  }
}

export function appendUniqueBillableWork(
  target: FormArray<BillingStatementLineForm>,
  items: readonly BillableWorkItem[],
  currency: string,
): number {
  const existingKeys = new Set(
    target.controls.flatMap((line) => {
      const type = line.controls.sourceType.value;
      const id = line.controls.sourceId.value;
      return type && id ? [`${type}:${id}`] : [];
    }),
  );
  let added = 0;
  for (const item of items) {
    if (existingKeys.has(item.sourceKey)) continue;
    target.push(createBillableWorkLineForm(item, currency));
    existingKeys.add(item.sourceKey);
    added += 1;
  }
  return added;
}

export function incompatibleCurrencyIndexes(
  lines: readonly BillingStatementLineForm[],
  statementCurrency: string,
): number[] {
  const expected = normalizeCurrency(statementCurrency);
  if (!expected) return [];
  return lines.flatMap((line, index) => {
    const actual = normalizeCurrency(line.controls.currency.value);
    return actual && actual !== expected ? [index] : [];
  });
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function isBillableWorkSourceType(
  value: string | null | undefined,
): value is BillableWorkSourceType {
  return value === "EVENT" || value === "TASK" || value === "DEADLINE";
}

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
