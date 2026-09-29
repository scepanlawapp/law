import { FormArray, FormControl, FormGroup, Validators } from "@angular/forms";
import { BillingStatementLineSummary } from "@law/api-interfaces";

export type BillingStatementLineForm = FormGroup<{
  id: FormControl<string | null>;
  performedByUserId: FormControl<string | null>;
  serviceDate: FormControl<string>;
  description: FormControl<string>;
  amount: FormControl<number | null>;
  currency: FormControl<string>;
}>;

export function createBillingStatementLineForm(
  line?: BillingStatementLineSummary,
  defaultCurrency = "RSD",
): BillingStatementLineForm {
  return new FormGroup({
    id: new FormControl(line?.id ?? null),
    performedByUserId: new FormControl(line?.performedBy.id ?? null),
    serviceDate: new FormControl(line?.serviceDate ?? localDate(), {
      nonNullable: true,
      validators: Validators.required,
    }),
    description: new FormControl(line?.description ?? "", {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(10_000)],
    }),
    amount: new FormControl<number | null>(line ? Number(line.amount) : null, [
      Validators.required,
      Validators.min(0.01),
    ]),
    currency: new FormControl(line?.currency ?? defaultCurrency, {
      nonNullable: true,
      validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
    }),
  });
}

export function detachBillingStatementLineSources(
  lines: readonly BillingStatementLineForm[],
): void {
  for (const line of lines) {
    if (!line.controls.id.value) continue;
    line.controls.id.setValue(null);
    line.controls.id.markAsDirty();
  }
}

export function appendUniqueBillingStatementLines(
  target: FormArray<BillingStatementLineForm>,
  lines: readonly BillingStatementLineSummary[],
): number {
  const existingIds = new Set(
    target.controls
      .map((line) => line.controls.id.value)
      .filter((id): id is string => Boolean(id)),
  );
  let added = 0;
  for (const line of lines) {
    if (existingIds.has(line.id)) continue;
    target.push(createBillingStatementLineForm(line));
    existingIds.add(line.id);
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

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
