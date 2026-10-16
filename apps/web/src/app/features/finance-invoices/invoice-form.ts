import {
  AbstractControl,
  FormArray,
  FormControl,
  FormGroup,
  ValidationErrors,
  Validators,
} from "@angular/forms";
import {
  InvoiceLineInput,
  InvoiceLineSummary,
  WorkEntry,
} from "@law/api-interfaces";
import { formatHoursMinutes } from "../../shared/billing";
import { DEFAULT_CURRENCY } from "../../shared/currency";
import { PAYMENT_METHOD_PREFERENCE_LABELS, labelOf } from "../../shared/models";

export function localizePaymentMethod(
  value: string | null | undefined,
  translate: (key: string) => string,
): string | null | undefined {
  if (!value) return value;
  return labelOf(PAYMENT_METHOD_PREFERENCE_LABELS, value, translate);
}

export type WorkEntryAllocationForm = FormGroup<{
  workEntryId: FormControl<string>;
  invoiceValue: FormControl<number | null>;
}>;

export type InvoiceLineForm = FormGroup<{
  workEntryAllocations: FormArray<WorkEntryAllocationForm>;
  additionalAmount: FormControl<number | null>;
  /** Saved line id; null for lines added in the composer. */
  id: FormControl<string | null>;
  workEntryIds: FormControl<string[]>;
  minutes: FormControl<number | null>;
  pricingRequired: FormControl<boolean>;
  serviceDate: FormControl<string>;
  description: FormControl<string>;
  netAmount: FormControl<number | null>;
  vatRate: FormControl<number | null>;
  vatAmount: FormControl<number | null>;
  grossAmount: FormControl<number | null>;
  currency: FormControl<string>;
}>;

/** The hourly rate and currency of a client, as far as it is known. */
export interface ClientRate {
  hourlyRate: string | null;
  currency: string;
}

const LINE_DESCRIPTION_LIMIT = 10_000;

export type InvoiceLineAmountSource =
  | "netAmount"
  | "vatRate"
  | "vatAmount"
  | "grossAmount";

export interface InvoiceLineAmounts {
  netAmount: number;
  vatRate: number;
  vatAmount: number;
  grossAmount: number;
}

export interface InvoiceTotals {
  netAmount: number;
  vatAmount: number;
  grossAmount: number;
}

export function calculateInvoiceLineAmounts(
  source: InvoiceLineAmountSource,
  values: Partial<Record<InvoiceLineAmountSource, number | null>>,
): InvoiceLineAmounts {
  const currentNet = normalizedNumber(values.netAmount);
  const currentRate = normalizedNumber(values.vatRate);
  const currentVat = normalizedNumber(values.vatAmount);
  const currentGross = normalizedNumber(values.grossAmount);

  if (source === "vatAmount") {
    if (currentNet === 0) return zeroAmounts();
    const vatRate = roundDecimal((currentVat / currentNet) * 100);
    return {
      netAmount: roundDecimal(currentNet),
      vatRate,
      vatAmount: roundDecimal(currentVat),
      grossAmount: roundDecimal(currentNet + currentVat),
    };
  }

  if (source === "grossAmount") {
    const netAmount = roundDecimal(currentGross / (1 + currentRate / 100));
    const vatAmount = roundDecimal(currentGross - netAmount);
    return {
      netAmount,
      vatRate: roundDecimal(currentRate),
      vatAmount,
      grossAmount: roundDecimal(netAmount + vatAmount),
    };
  }

  return amountsFromNetAndRate(currentNet, currentRate);
}

export function calculateInvoiceTotals(
  rows: ReadonlyArray<{
    netAmount: number | null | undefined;
    vatAmount: number | null | undefined;
  }>,
): InvoiceTotals {
  const netAmount = roundDecimal(
    rows.reduce((sum, row) => sum + normalizedNumber(row.netAmount), 0),
  );
  const vatAmount = roundDecimal(
    rows.reduce((sum, row) => sum + normalizedNumber(row.vatAmount), 0),
  );
  return {
    netAmount,
    vatAmount,
    grossAmount: roundDecimal(netAmount + vatAmount),
  };
}

/**
 * A priced line must have a positive net amount; a line flagged
 * `pricingRequired` may stay at zero until the user enters the price.
 */
function pricedOrFlaggedValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const group = control as InvoiceLineForm;
  const net = group.controls.netAmount.value;
  return group.controls.pricingRequired.value ||
    (net !== null && net > 0) ||
    (net === 0 && Boolean(group.controls.id.value))
    ? null
    : { priceRequired: true };
}

function buildLineForm(init: {
  id?: string | null;
  workEntryAllocations?: { workEntryId: string; invoiceValue: number }[];
  additionalAmount?: number;
  workEntryIds: string[];
  minutes: number | null;
  pricingRequired: boolean;
  serviceDate: string;
  description: string;
  netAmount: number | null;
  vatRate: number;
  vatAmount: number;
  grossAmount: number | null;
  currency: string;
}): InvoiceLineForm {
  const line: InvoiceLineForm = new FormGroup(
    {
      workEntryAllocations: new FormArray(
        (init.workEntryAllocations ?? []).map(
          (item) =>
            new FormGroup({
              workEntryId: new FormControl(item.workEntryId, {
                nonNullable: true,
              }),
              invoiceValue: new FormControl<number | null>(item.invoiceValue, [
                Validators.required,
                Validators.min(0.01),
                moneyPrecisionValidator,
              ]),
            }),
        ),
      ),
      additionalAmount: new FormControl<number | null>(
        init.additionalAmount ?? 0,
        [Validators.required, Validators.min(0), moneyPrecisionValidator],
      ),
      id: new FormControl<string | null>(init.id ?? null),
      workEntryIds: new FormControl(init.workEntryIds, { nonNullable: true }),
      minutes: new FormControl<number | null>(init.minutes),
      pricingRequired: new FormControl(init.pricingRequired, {
        nonNullable: true,
      }),
      serviceDate: new FormControl(init.serviceDate, {
        nonNullable: true,
        validators: Validators.required,
      }),
      description: new FormControl(init.description, {
        nonNullable: true,
        validators: [Validators.required, Validators.maxLength(10_000)],
      }),
      netAmount: new FormControl<number | null>(init.netAmount, [
        Validators.required,
        Validators.min(0),
      ]),
      vatRate: new FormControl<number | null>(init.vatRate, [
        Validators.required,
        Validators.min(0),
        Validators.max(100),
      ]),
      vatAmount: new FormControl<number | null>(init.vatAmount, [
        Validators.required,
        Validators.min(0),
      ]),
      grossAmount: new FormControl<number | null>(init.grossAmount, [
        Validators.required,
        Validators.min(0),
      ]),
      currency: new FormControl(init.currency, {
        nonNullable: true,
        validators: [Validators.required, Validators.pattern(/^[A-Za-z]{3}$/)],
      }),
    },
    { validators: [pricedOrFlaggedValidator, allocationTotalValidator] },
  );
  // Form-owned subscriptions live exactly as long as this line; there is no external stream.
  line.controls.workEntryAllocations.valueChanges.subscribe(() =>
    recalculateInvoiceLine(line, "netAmount"),
  );
  line.controls.additionalAmount.valueChanges.subscribe(() =>
    recalculateInvoiceLine(line, "netAmount"),
  );
  if (init.workEntryIds.length) recalculateInvoiceLine(line, "netAmount");
  return line;
}

function moneyPrecisionValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = control.value as number | null;
  return value == null ||
    (Number.isFinite(value) &&
      Math.abs(value * 100 - Math.round(value * 100)) < 0.000001 &&
      Math.abs(value * 100) <= Number.MAX_SAFE_INTEGER)
    ? null
    : { moneyPrecision: true };
}

function allocationTotalValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const line = control as InvoiceLineForm;
  if (!line.controls.workEntryIds.value.length) return null;
  const allocations = line.controls.workEntryAllocations.getRawValue();
  const ids = line.controls.workEntryIds.value;
  const total = allocations.reduce(
    (sum, item) => sum + Math.round((item.invoiceValue ?? 0) * 100),
    Math.round((line.controls.additionalAmount.value ?? 0) * 100),
  );
  return allocations.length === ids.length &&
    new Set(allocations.map((item) => item.workEntryId)).size === ids.length &&
    allocations.every((item) => ids.includes(item.workEntryId)) &&
    Number.isSafeInteger(total)
    ? null
    : { workAllocationRequired: true };
}

export function createInvoiceLineForm(
  line?: InvoiceLineSummary,
  defaultCurrency: string = DEFAULT_CURRENCY,
  defaultVatRate = 0,
): InvoiceLineForm {
  return buildLineForm({
    id: line?.id ?? null,
    additionalAmount: Number(line?.additionalAmount ?? 0),
    workEntryAllocations: line?.workEntries.map((entry) => ({
      workEntryId: entry.id,
      invoiceValue: Number(
        line.workEntryAllocations?.find((item) => item.workEntryId === entry.id)
          ?.invoiceValue ??
          (normalizeCurrency(entry.currency ?? "") ===
          normalizeCurrency(line.currency)
            ? (entry.value ?? 0)
            : 0),
      ),
    })),
    workEntryIds: line?.workEntries.map((entry) => entry.id) ?? [],
    minutes: line?.minutes ?? null,
    pricingRequired: line?.pricingRequired ?? false,
    serviceDate: line?.serviceDate.slice(0, 10) ?? localDate(),
    description: line?.description ?? "",
    netAmount: line ? Number(line.netAmount) : null,
    vatRate: line ? Number(line.vatRate) : defaultVatRate,
    vatAmount: line ? Number(line.vatAmount) : 0,
    grossAmount: line ? Number(line.grossAmount) : null,
    currency: line?.currency ?? defaultCurrency,
  });
}

/** Initial allocations use only recorded prices in the invoice currency. */
export function createWorkEntryLineForm(
  entry: WorkEntry,
  currency: string,
  rate: ClientRate | null,
  defaultVatRate = 0,
): InvoiceLineForm {
  const line = createGroupedWorkEntryLineForm(
    [entry],
    currency,
    rate,
    defaultVatRate,
  );
  line.controls.description.setValue(
    entry.minutes === null
      ? entry.title
      : `${entry.title} (${formatHoursMinutes(entry.minutes)})`,
  );
  return line;
}

/** Stable service-date/ID order shared by grouped descriptions and associations. */
export function sortWorkEntries<T extends Pick<WorkEntry, "id" | "workDate">>(
  entries: readonly T[],
): T[] {
  const unique = new Map<string, T>();
  for (const entry of entries) unique.set(entry.id, entry);
  return [...unique.values()].sort((left, right) => {
    const leftDate = left.workDate.slice(0, 10);
    const rightDate = right.workDate.slice(0, 10);
    if (leftDate !== rightDate) return leftDate < rightDate ? -1 : 1;
    return left.id === right.id ? 0 : left.id < right.id ? -1 : 1;
  });
}

/** Joins original titles without allowing an invoice line past its form limit. */
export function concatenateWorkEntryTitles(
  entries: readonly Pick<WorkEntry, "id" | "workDate" | "title">[],
  overflowFallback: string,
): string {
  const description = sortWorkEntries(entries)
    .map((entry) => entry.title.trim())
    .filter(Boolean)
    .join("; ");
  return description.length <= LINE_DESCRIPTION_LIMIT
    ? description
    : overflowFallback.slice(0, LINE_DESCRIPTION_LIMIT);
}

/** Creates one invoice line for a deterministic group of distinct work entries. */
export function createGroupedWorkEntryLineForm(
  entries: readonly WorkEntry[],
  currency: string,
  _rate: ClientRate | null,
  defaultVatRate = 0,
  overflowFallback = "",
): InvoiceLineForm {
  const ordered = sortWorkEntries(entries);
  const minutes = ordered.reduce<number | null>(
    (total, entry) =>
      entry.minutes === null ? total : (total ?? 0) + entry.minutes,
    null,
  );
  const currencyCode = normalizeCurrency(currency);
  const allocations = ordered.map((entry) => {
    const minor =
      normalizeCurrency(entry.currency ?? "") === currencyCode
        ? parseMinorUnits(entry.value)
        : null;
    return {
      workEntryId: entry.id,
      invoiceValue:
        minor !== null && isSafeMinorUnits(minor)
          ? minorUnitsToNumber(minor)
          : 0,
    };
  });
  return buildLineForm({
    workEntryIds: ordered.map((entry) => entry.id),
    workEntryAllocations: allocations,
    minutes,
    pricingRequired: allocations.some((item) => item.invoiceValue <= 0),
    serviceDate: ordered[0]?.workDate.slice(0, 10) ?? localDate(),
    description: concatenateWorkEntryTitles(ordered, overflowFallback),
    netAmount: 0,
    vatRate: defaultVatRate,
    vatAmount: 0,
    grossAmount: 0,
    currency: currencyCode,
  });
}

/** Appends one grouped line and returns the count of newly associated entries. */
export function appendGroupedWorkEntries(
  target: FormArray<InvoiceLineForm>,
  entries: readonly WorkEntry[],
  currency: string,
  rate: ClientRate | null,
  defaultVatRate = 0,
  overflowFallback = "",
): number {
  const existing = new Set(lineWorkEntryIds(target.controls));
  const addedEntries = sortWorkEntries(entries).filter(
    (entry) => !existing.has(entry.id),
  );
  if (!addedEntries.length) return 0;
  target.push(
    createGroupedWorkEntryLineForm(
      addedEntries,
      currency,
      rate,
      defaultVatRate,
      overflowFallback,
    ),
  );
  return addedEntries.length;
}

/** Work entry ids that already back a line of the invoice. */
export function lineWorkEntryIds(lines: readonly InvoiceLineForm[]): string[] {
  return lines.flatMap((line) => line.controls.workEntryIds.value);
}

/** Entry-backed lines of another client are no longer valid; they become manual. */
export function detachInvoiceLineWorkEntries(
  lines: readonly InvoiceLineForm[],
): void {
  for (const line of lines) {
    if (!line.controls.workEntryIds.value.length) continue;
    line.controls.workEntryIds.setValue([]);
    line.controls.workEntryAllocations.clear({ emitEvent: false });
    line.controls.additionalAmount.setValue(0, { emitEvent: false });
    line.controls.pricingRequired.setValue(false, { emitEvent: false });
    line.controls.minutes.setValue(null);
    line.markAsDirty();
  }
}

export function appendUniqueWorkEntries(
  target: FormArray<InvoiceLineForm>,
  entries: readonly WorkEntry[],
  currency: string,
  rate: ClientRate | null,
  defaultVatRate = 0,
): number {
  const existing = new Set(lineWorkEntryIds(target.controls));
  let added = 0;
  for (const entry of entries) {
    if (existing.has(entry.id)) continue;
    target.push(createWorkEntryLineForm(entry, currency, rate, defaultVatRate));
    existing.add(entry.id);
    added += 1;
  }
  return added;
}

/**
 * Recomputes the dependent amounts of a line after `source` changed. A line
 * flagged `pricingRequired` stops being flagged once it has a positive amount.
 */
export function recalculateInvoiceLine(
  line: InvoiceLineForm,
  source: InvoiceLineAmountSource,
): void {
  const linked = line.controls.workEntryIds.value.length > 0;
  if (linked) {
    const totalMinor = line.controls.workEntryAllocations.controls.reduce(
      (sum, item) =>
        sum + Math.round((item.controls.invoiceValue.value ?? 0) * 100),
      Math.round((line.controls.additionalAmount.value ?? 0) * 100),
    );
    line.controls.netAmount.setValue(
      Number.isSafeInteger(totalMinor) ? totalMinor / 100 : 0,
      { emitEvent: false },
    );
    line.controls.pricingRequired.setValue(
      line.controls.workEntryAllocations.invalid ||
        line.controls.workEntryAllocations.controls.some(
          (item) => (item.controls.invoiceValue.value ?? 0) <= 0,
        ),
      { emitEvent: false },
    );
  }
  const amounts = calculateInvoiceLineAmounts(
    linked && source === "grossAmount" ? "netAmount" : source,
    line.getRawValue(),
  );
  line.patchValue(amounts, { emitEvent: false });
  if (!linked && amounts.netAmount > 0 && line.controls.pricingRequired.value) {
    line.controls.pricingRequired.setValue(false, { emitEvent: false });
  }
  line.updateValueAndValidity({ emitEvent: false });
}

/** Sending is blocked while any line still needs its price. */
export function hasPricingRequiredLines(
  lines: ReadonlyArray<{ pricingRequired: boolean }>,
): boolean {
  return lines.some((line) => line.pricingRequired);
}

export function toInvoiceLineInput(line: InvoiceLineForm): InvoiceLineInput {
  const value = line.getRawValue();
  return {
    // Line identity lets the server keep a fee line's retainer marker.
    ...(value.id ? { id: value.id } : {}),
    serviceDate: value.serviceDate,
    description: value.description.trim(),
    netAmount: value.netAmount ?? 0,
    vatRate: value.vatRate ?? 0,
    vatAmount: value.vatAmount ?? 0,
    grossAmount: value.grossAmount ?? 0,
    currency: normalizeCurrency(value.currency),
    ...(value.workEntryIds.length
      ? {
          workEntryIds: value.workEntryIds,
          workEntryAllocations: value.workEntryAllocations.map((item) => ({
            workEntryId: item.workEntryId,
            invoiceValue: item.invoiceValue ?? 0,
          })),
          additionalAmount: value.additionalAmount ?? 0,
        }
      : {}),
    ...(value.minutes !== null ? { minutes: value.minutes } : {}),
    pricingRequired: value.pricingRequired,
  };
}

export function incompatibleCurrencyIndexes(
  lines: readonly InvoiceLineForm[],
  invoiceCurrency: string,
): number[] {
  const expected = normalizeCurrency(invoiceCurrency);
  if (!expected) return [];
  return lines.flatMap((line, index) => {
    const actual = normalizeCurrency(line.controls.currency.value);
    return actual && actual !== expected ? [index] : [];
  });
}

export function normalizeCurrency(value: string): string {
  return value.trim().toUpperCase();
}

export function sumDecimalValues(values: readonly string[]): string | null {
  let total = BigInt(0);
  for (const value of values) {
    const minor = parseMinorUnits(value);
    if (minor === null) return null;
    total += minor;
  }
  return `${total / BigInt(100)}.${String(total % BigInt(100)).padStart(2, "0")}`;
}

function parseMinorUnits(
  value: string | number | null | undefined,
): bigint | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    value = value.toFixed(2);
  }
  if (typeof value !== "string" || !/^\d+(?:\.\d{1,2})?$/.test(value.trim()))
    return null;
  const [whole, fraction = ""] = value.trim().split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
}

function isSafeMinorUnits(value: bigint): boolean {
  return value <= BigInt(Number.MAX_SAFE_INTEGER);
}

function minorUnitsToNumber(value: bigint): number {
  return Number(value) / 100;
}

function amountsFromNetAndRate(
  netAmountValue: number,
  vatRateValue: number,
): InvoiceLineAmounts {
  const netAmount = roundDecimal(netAmountValue);
  const vatRate = roundDecimal(vatRateValue);
  const vatAmount = roundDecimal((netAmount * vatRate) / 100);
  return {
    netAmount,
    vatRate,
    vatAmount,
    grossAmount: roundDecimal(netAmount + vatAmount),
  };
}

function normalizedNumber(value: number | null | undefined): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function roundDecimal(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function zeroAmounts(): InvoiceLineAmounts {
  return { netAmount: 0, vatRate: 0, vatAmount: 0, grossAmount: 0 };
}

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}
