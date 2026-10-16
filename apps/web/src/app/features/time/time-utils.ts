import { type WorkEntry, WorkEntryStatus } from "@law/api-interfaces";
import { statusBadgeClass } from "../../shared/status-badge";
import { OFFICE_TIME_ZONE } from "../../shared/models";

/** Today as a YYYY-MM-DD calendar day in the office time zone. */
export function officeToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: OFFICE_TIME_ZONE,
  }).format(now);
}

export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

/** Adds calendar days to a YYYY-MM-DD date (pure calendar arithmetic, no DST). */
export function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

/** The Monday of the week containing `date`. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(date, -((weekday + 6) % 7));
}

/** Monday..Sunday of the week starting at `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
}

export function sumMinutes(entries: readonly WorkEntry[]): number {
  return entries.reduce((total, entry) => total + (entry.minutes ?? 0), 0);
}

/** `1h 30m`, `45m`, `2h`, `0m`. */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Semantic-token classes for a status badge. */
export const STATUS_BADGE_CLASSES: Record<WorkEntryStatus, string> = {
  [WorkEntryStatus.RUNNING]: statusBadgeClass(WorkEntryStatus.RUNNING),
  [WorkEntryStatus.PROPOSED]: statusBadgeClass(WorkEntryStatus.PROPOSED),
  [WorkEntryStatus.CONFIRMED]: statusBadgeClass(WorkEntryStatus.CONFIRMED),
  [WorkEntryStatus.BILLED]: statusBadgeClass(WorkEntryStatus.BILLED),
  [WorkEntryStatus.WRITTEN_OFF]: statusBadgeClass(WorkEntryStatus.WRITTEN_OFF),
};

/** Edit, confirm and write-off apply only before an entry is billed or closed. */
export function isEditable(entry: WorkEntry): boolean {
  return (
    entry.status === WorkEntryStatus.PROPOSED ||
    entry.status === WorkEntryStatus.CONFIRMED
  );
}

/** Recorded work value with two decimals and its currency, e.g. `12.000,00 RSD`. */
export function formatWorkValue(
  value: string,
  currency: string | null | undefined,
  locale: string,
): string {
  return `${new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value))} ${currency ?? ""}`;
}

/** Minutes between two instants, at least 1 and at most one day. */
export function minutesBetween(startsAt: string, endsAt: string): number {
  const minutes = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  );
  return Math.min(1440, Math.max(1, minutes));
}
