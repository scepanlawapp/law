import type {
  WorkEntry,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";

export const OFFICE_TIME_ZONE = "Europe/Belgrade";

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

export const STATUS_LABEL_KEYS: Record<WorkEntryStatus, string> = {
  RUNNING: "time.status.running",
  PROPOSED: "time.status.proposed",
  CONFIRMED: "time.status.confirmed",
  BILLED: "time.status.billed",
  WRITTEN_OFF: "time.status.writtenOff",
};

export const TREATMENT_LABEL_KEYS: Record<WorkEntryTreatment, string> = {
  RETAINER: "time.treatment.retainer",
  AT: "time.treatment.at",
  HOURLY: "time.treatment.hourly",
  NON_BILLABLE: "time.treatment.nonBillable",
  UNDECIDED: "time.treatment.undecided",
};

/** Semantic-token classes for a status badge. */
export const STATUS_BADGE_CLASSES: Record<WorkEntryStatus, string> = {
  RUNNING: "bg-primary/15 text-primary",
  PROPOSED: "bg-accent text-accent-foreground",
  CONFIRMED: "bg-secondary text-secondary-foreground",
  BILLED: "bg-muted text-muted-foreground",
  WRITTEN_OFF: "bg-destructive/10 text-destructive",
};

/** Edit, confirm and write-off apply only before an entry is billed or closed. */
export function isEditable(entry: WorkEntry): boolean {
  return entry.status === "PROPOSED" || entry.status === "CONFIRMED";
}

/** Minutes between two instants, at least 1 and at most one day. */
export function minutesBetween(startsAt: string, endsAt: string): number {
  const minutes = Math.round(
    (new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000,
  );
  return Math.min(1440, Math.max(1, minutes));
}
