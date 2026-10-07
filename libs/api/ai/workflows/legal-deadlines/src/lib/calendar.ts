/**
 * Serbian non-working days under the Zakon o državnim i drugim praznicima u
 * Republici Srbiji ("Sl. glasnik RS", br. 43/2001, 101/2007 i 92/2011):
 * - state holidays: Nova godina (1–2 Jan), Sretenje (15–16 Feb), Praznik rada
 *   (1–2 May), Dan primirja (11 Nov); Dan pobede (9 May) is a working day;
 * - religious holidays: first day of Božić (7 Jan) and Vaskrs from Veliki
 *   petak to the second day of Vaskrs (Orthodox calendar);
 * - čl. 3a: when a state-holiday date falls on a Sunday, the first next
 *   working day is non-working.
 * Saturdays and Sundays are non-working for courts and authorities.
 *
 * All dates are calendar dates as `YYYY-MM-DD`, computed in UTC so no time
 * zone can move them.
 */

export type NonWorkingReason =
  | "SATURDAY"
  | "SUNDAY"
  | "HOLIDAY"
  | "HOLIDAY_SHIFT";

export interface NonWorkingDay {
  date: string;
  reason: NonWorkingReason;
  /** Serbian name of the holiday, or of the weekday. */
  name: string;
}

const STATE_HOLIDAYS: ReadonlyArray<{
  month: number;
  day: number;
  name: string;
}> = [
  { month: 1, day: 1, name: "Nova godina" },
  { month: 1, day: 2, name: "Nova godina" },
  { month: 2, day: 15, name: "Sretenje – Dan državnosti Srbije" },
  { month: 2, day: 16, name: "Sretenje – Dan državnosti Srbije" },
  { month: 5, day: 1, name: "Praznik rada" },
  { month: 5, day: 2, name: "Praznik rada" },
  { month: 11, day: 11, name: "Dan primirja u Prvom svetskom ratu" },
];

const DAY_MS = 24 * 60 * 60 * 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Parses a real calendar date `YYYY-MM-DD`; null otherwise. */
export function parseIsoDate(value: string): Date | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const [year, month, day] = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? date
    : null;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && parseIsoDate(value) !== null;
}

function requireDate(value: string): Date {
  const date = parseIsoDate(value);
  if (!date) throw new Error(`Invalid date: ${value}`);
  return date;
}

function toIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function utc(year: number, month: number, day: number): string {
  return toIso(new Date(Date.UTC(year, month - 1, day)));
}

export function addDays(date: string, days: number): string {
  return toIso(new Date(requireDate(date).getTime() + days * DAY_MS));
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(date: string): number {
  return requireDate(date).getUTCDay();
}

/**
 * Orthodox Easter Sunday as a Gregorian date (Meeus' Julian algorithm plus
 * the 13-day calendar difference, valid 1900–2099).
 */
export function orthodoxEaster(year: number): string {
  if (year < 1900 || year > 2099) {
    throw new Error(`Orthodox Easter is computed only for 1900–2099: ${year}`);
  }
  const a = year % 4;
  const b = year % 7;
  const c = year % 19;
  const d = (19 * c + 15) % 30;
  const e = (2 * a + 4 * b - d + 34) % 7;
  const month = Math.floor((d + e + 114) / 31);
  const day = ((d + e + 114) % 31) + 1;
  return addDays(utc(year, month, day), 13);
}

const holidayCache = new Map<number, ReadonlyMap<string, NonWorkingDay>>();

/** Public holidays and čl. 3a shift days of a year (weekends not included). */
export function serbianHolidays(
  year: number,
): ReadonlyMap<string, NonWorkingDay> {
  const cached = holidayCache.get(year);
  if (cached) return cached;
  const days = new Map<string, NonWorkingDay>();
  const add = (date: string, name: string, reason: NonWorkingReason) => {
    if (!days.has(date)) days.set(date, { date, reason, name });
  };
  for (const holiday of STATE_HOLIDAYS) {
    add(utc(year, holiday.month, holiday.day), holiday.name, "HOLIDAY");
  }
  add(utc(year, 1, 7), "Božić", "HOLIDAY");
  const easter = orthodoxEaster(year);
  add(addDays(easter, -2), "Veliki petak", "HOLIDAY");
  add(addDays(easter, -1), "Velika subota", "HOLIDAY");
  add(easter, "Vaskrs", "HOLIDAY");
  add(addDays(easter, 1), "Vaskršnji ponedeljak", "HOLIDAY");

  for (const holiday of STATE_HOLIDAYS) {
    const date = utc(year, holiday.month, holiday.day);
    if (weekday(date) !== 0) continue;
    let next = addDays(date, 1);
    while (isWeekend(next) || days.has(next)) next = addDays(next, 1);
    days.set(next, {
      date: next,
      reason: "HOLIDAY_SHIFT",
      name: `${holiday.name} (pada u nedelju)`,
    });
  }
  holidayCache.set(year, days);
  return days;
}

function isWeekend(date: string): boolean {
  const day = weekday(date);
  return day === 0 || day === 6;
}

/** Why a date is non-working, or null for a working day. */
export function nonWorkingDay(date: string): NonWorkingDay | null {
  const holiday = serbianHolidays(requireDate(date).getUTCFullYear()).get(date);
  if (holiday) return holiday;
  const day = weekday(date);
  if (day === 6) return { date, reason: "SATURDAY", name: "subota" };
  if (day === 0) return { date, reason: "SUNDAY", name: "nedelja" };
  return null;
}

export function isWorkingDay(date: string): boolean {
  return nonWorkingDay(date) === null;
}
