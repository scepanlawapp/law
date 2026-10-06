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
import { formatHoursMinutes, priceMinutes } from "../../shared/billing";

const PAYMENT_METHOD_TRANSLATION_KEYS: Record<string, string> = {
  BANK_TRANSFER: "settings.organization.payment.methods.BANK_TRANSFER",
  CASH: "settings.organization.payment.methods.CASH",
  CARD: "settings.organization.payment.methods.CARD",
  OTHER: "settings.organization.payment.methods.OTHER",
};

export function localizePaymentMethod(
  value: string | null | undefined,
  translate: (key: string) => string,
): string | null | undefined {
  if (!value) return value;
  const translationKey = PAYMENT_METHOD_TRANSLATION_KEYS[value];
  return translationKey ? translate(translationKey) : value;
}

export type InvoiceLineForm = FormGroup<{
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
  return group.controls.pricingRequired.value || (net !== null && net > 0)
    ? null
    : { priceRequired: true };
}

function buildLineForm(init: {
  id?: string | null;
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
  return new FormGroup(
    {
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
    { validators: pricedOrFlaggedValidator },
  );
}

export function createInvoiceLineForm(
  line?: InvoiceLineSummary,
  defaultCurrency = "RSD",
  defaultVatRate = 0,
): InvoiceLineForm {
  return buildLineForm({
    id: line?.id ?? null,
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

/**
 * One line per imported work entry. An HOURLY entry is priced at the client's
 * hourly rate when that rate is in the invoice currency; anything else gets
 * a zero amount flagged `pricingRequired` so the user must price it.
 */
export function createWorkEntryLineForm(
  entry: WorkEntry,
  currency: string,
  rate: ClientRate | null,
  defaultVatRate = 0,
): InvoiceLineForm {
  const minutes = entry.minutes;
  const sameCurrency =
    !!rate && normalizeCurrency(rate.currency) === normalizeCurrency(currency);
  const price =
    entry.treatment === "HOURLY" && sameCurrency && minutes !== null
      ? (priceMinutes(minutes, rate?.hourlyRate) ?? 0)
      : 0;
  const priced = price > 0;
  return buildLineForm({
    workEntryIds: [entry.id],
    minutes,
    pricingRequired: !priced,
    serviceDate: entry.workDate.slice(0, 10),
    // Untimed work shows just its title and is priced by hand.
    description:
      minutes === null
        ? entry.title
        : `${entry.title} (${formatHoursMinutes(minutes)})`,
    netAmount: price,
    vatRate: defaultVatRate,
    vatAmount: amountsFromNetAndRate(price, defaultVatRate).vatAmount,
    grossAmount: amountsFromNetAndRate(price, defaultVatRate).grossAmount,
    currency,
  });
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
  const amounts = calculateInvoiceLineAmounts(source, line.getRawValue());
  line.patchValue(amounts, { emitEvent: false });
  if (amounts.netAmount > 0 && line.controls.pricingRequired.value) {
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
    ...(value.workEntryIds.length ? { workEntryIds: value.workEntryIds } : {}),
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
