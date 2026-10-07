import {
  addDays,
  nonWorkingDay,
  parseIsoDate,
  type NonWorkingDay,
} from "./calendar";

export interface ComputedDeadline {
  /** The day the period starts from (service), not counted. */
  startDate: string;
  /** First counted day. */
  firstDay: string;
  /** Last day of the period before any shift. */
  nominalEndDate: string;
  /** The deadline: the nominal end, or the first working day after it. */
  dueDate: string;
  /** Non-working days the end was moved over, in order. */
  shiftedOver: NonWorkingDay[];
  days: number;
}

/**
 * A period set in days (ZPP čl. 103, ZUP čl. 80): the day of service is not
 * counted, the period starts the next day, and when its last day is a
 * Saturday, Sunday or public holiday it ends at the end of the first next
 * working day.
 */
export function computeDeadline(
  startDate: string,
  days: number,
): ComputedDeadline {
  if (!parseIsoDate(startDate)) throw new Error(`Invalid date: ${startDate}`);
  if (!Number.isInteger(days) || days < 1) {
    throw new Error(`Invalid period: ${days}`);
  }
  const nominalEndDate = addDays(startDate, days);
  const shiftedOver: NonWorkingDay[] = [];
  let dueDate = nominalEndDate;
  for (let off = nonWorkingDay(dueDate); off; off = nonWorkingDay(dueDate)) {
    shiftedOver.push(off);
    dueDate = addDays(dueDate, 1);
  }
  return {
    startDate,
    firstDay: addDays(startDate, 1),
    nominalEndDate,
    dueDate,
    shiftedOver,
    days,
  };
}

/** `15.03.2026.` */
export function formatSerbianDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}.${month}.${year}.`;
}
