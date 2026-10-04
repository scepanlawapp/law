import { AbstractControl, ValidationErrors } from "@angular/forms";
import { WorkspaceRole } from "@law/api-interfaces";
import type { RetainerUsage } from "@law/api-interfaces";
import { officeToday } from "../features/time/time-utils";

/** Rates, workspace billing config and retainer writes: OWNER and ADMIN only. */
export function canManageBilling(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === WorkspaceRole.OWNER || role === WorkspaceRole.ADMIN;
}

/** The month-end billing run (precheck and draft generation) is OWNER only. */
export function canRunMonthEnd(
  role: WorkspaceRole | null | undefined,
): boolean {
  return role === WorkspaceRole.OWNER;
}

/** Retainer agreements and usage may be read by OWNER, ADMIN and LAWYER. */
export function canViewRetainers(
  role: WorkspaceRole | null | undefined,
): boolean {
  return canManageBilling(role) || role === WorkspaceRole.LAWYER;
}

/** Decimal money as the API accepts it: up to 2 fraction digits (comma or dot). */
export const MONEY_INPUT_PATTERN = /^\d{1,16}([.,]\d{1,2})?$/;

/** `12000,5` -> `12000.5`; empty input -> `null`. */
export function normalizeMoney(
  value: string | null | undefined,
): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed.replace(",", ".") : null;
}

/** Money greater than zero; an empty value is left to `required`. */
export function positiveMoneyValidator(
  control: AbstractControl,
): ValidationErrors | null {
  const value = normalizeMoney(control.value);
  return value === null || Number(value) > 0 ? null : { positive: true };
}

/** The current month as YYYY-MM in the office time zone. */
export function officeMonth(now: Date = new Date()): string {
  return officeToday(now).slice(0, 7);
}

export function isMonth(value: string | null | undefined): value is string {
  return !!value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** Share of the included hours already covered, or `null` when uncapped. */
export function usagePercent(
  usage: Pick<RetainerUsage, "coveredMinutes" | "includedMinutes">,
): number | null {
  if (!usage.includedMinutes || usage.includedMinutes <= 0) return null;
  return (usage.coveredMinutes / usage.includedMinutes) * 100;
}

export type UsageState = "ok" | "warning" | "exceeded";

/**
 * Warning from 80 % of the included hours, exceeded above 100 %. Compared in
 * integer minutes so the thresholds are exact (no floating-point percent).
 */
export function usageState(
  usage: Pick<RetainerUsage, "coveredMinutes" | "includedMinutes">,
): UsageState {
  if (!usage.includedMinutes || usage.includedMinutes <= 0) return "ok";
  if (usage.coveredMinutes > usage.includedMinutes) return "exceeded";
  return usage.coveredMinutes * 100 >= usage.includedMinutes * 80
    ? "warning"
    : "ok";
}

/** A stored YYYY-MM-DD date as a short localized date, e.g. `1. 10. 2026.`. */
export function formatDate(value: string, language: "SR" | "EN"): string {
  return new Intl.DateTimeFormat(numberLocale(language), {
    timeZone: "UTC",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00Z`));
}

export function numberLocale(language: "SR" | "EN"): string {
  return language === "EN" ? "en-GB" : "sr-Latn";
}

/** `16`, `7,5` (at most one decimal) for a number of minutes expressed in hours. */
export function formatHours(minutes: number, language: "SR" | "EN"): string {
  return new Intl.NumberFormat(numberLocale(language), {
    maximumFractionDigits: 1,
  }).format(minutes / 60);
}

export function formatMoney(
  amount: string | number,
  currency: string,
  language: "SR" | "EN",
): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(numberLocale(language), {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

/** `2026-10` as a long month label, e.g. `oktobar 2026`. */
export function formatMonthLabel(month: string, language: "SR" | "EN"): string {
  return new Intl.DateTimeFormat(numberLocale(language), {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T00:00:00Z`));
}

/** True for a 403 response, which the billing screens treat as "not available". */
export function isForbidden(error: unknown): boolean {
  return (error as { status?: number } | null)?.status === 403;
}

/** The month before `month` (`2026-01` -> `2025-12`). */
export function previousMonth(month: string): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 2, 1));
  return date.toISOString().slice(0, 7);
}

/**
 * Hourly price of `minutes`, in the currency of `hourlyRate` (a decimal string
 * such as `"8000.00"`): minutes / 60 x rate, rounded half-up to 2 decimals.
 * Integer arithmetic only, so no floating-point drift. Mirrors the API's
 * `priceMinutes`; it only pre-fills the form, the user still owns the amount.
 * Returns `null` for a rate that is not a non-negative decimal.
 */
export function priceMinutes(
  minutes: number,
  hourlyRate: string | null | undefined,
): number | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec((hourlyRate ?? "").trim());
  if (!match || !Number.isInteger(minutes) || minutes < 0) return null;
  const fraction = match[2] ?? "";
  const unscaled = BigInt(match[1] + fraction);
  const numerator = unscaled * BigInt(minutes) * BigInt(100);
  const denominator = BigInt(60) * BigInt(10) ** BigInt(fraction.length);
  const cents =
    (BigInt(2) * numerator + denominator) / (BigInt(2) * denominator);
  return Number(cents) / 100;
}

/** `1 h 30 min`: the duration wording used in invoice line descriptions. */
export function formatHoursMinutes(minutes: number): string {
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}
