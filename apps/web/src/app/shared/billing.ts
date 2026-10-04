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

/** Warning from 80 % of the included hours, exceeded above 100 %. */
export function usageState(percent: number | null): UsageState {
  if (percent === null) return "ok";
  if (percent > 100) return "exceeded";
  return percent >= 80 ? "warning" : "ok";
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
