import type { WorkEntryTreatment } from "@law/api-interfaces";
import { Prisma } from "@prisma/client";
import type { AgreementTerms } from "./treatment";

export interface AllocEntry {
  id: string;
  workDate: Date;
  createdAt: Date;
  minutes: number;
  serviceCategoryId: string | null;
  caseId: string | null;
  treatment: WorkEntryTreatment;
}

export interface MonthProration {
  activeDays: number;
  daysInMonth: number;
  fee: Prisma.Decimal;
  includedMinutes: number | null;
}

export interface Allocation {
  /** Covered entries within the cap (or all covered when overage is ABSORBED). */
  feeEntryIds: string[];
  /** Priced overage; `minutes` counts only the minutes above the cap. */
  overage: { entryIds: string[]; minutes: number } | null;
  outOfScope: { groupKey: string; entryIds: string[]; minutes: number }[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}

/** Prorates fee and cap by the inclusive active days within `month` (YYYY-MM). */
export function prorate(
  agreement: AgreementTerms,
  month: string,
): MonthProration | null {
  const [year, monthNumber] = month.split("-").map(Number);
  const monthStart = Date.UTC(year, monthNumber - 1, 1);
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const monthEnd = monthStart + (daysInMonth - 1) * DAY_MS;

  const start = Math.max(agreement.validFrom.getTime(), monthStart);
  const end = Math.min(agreement.validTo?.getTime() ?? Infinity, monthEnd);
  if (end < start) return null;
  const activeDays = Math.round((end - start) / DAY_MS) + 1;

  return {
    activeDays,
    daysInMonth,
    fee: roundMoney(agreement.monthlyFee.mul(activeDays).div(daysInMonth)),
    includedMinutes:
      agreement.includedMinutes === null
        ? null
        : Math.floor((agreement.includedMinutes * activeDays) / daysInMonth),
  };
}

function groupKeyOf(entry: AllocEntry): string {
  if (entry.caseId) return entry.caseId;
  return `cat:${entry.serviceCategoryId ?? "none"}`;
}

export function allocate(
  agreement: AgreementTerms,
  proration: MonthProration,
  alreadyCoveredMinutes: number,
  entries: AllocEntry[],
): Allocation {
  const sorted = [...entries].sort(
    (a, b) =>
      a.workDate.getTime() - b.workDate.getTime() ||
      a.createdAt.getTime() - b.createdAt.getTime(),
  );

  const feeEntryIds: string[] = [];
  const overageEntryIds: string[] = [];
  let overageMinutes = 0;
  let running = alreadyCoveredMinutes;
  const groups = new Map<
    string,
    { groupKey: string; entryIds: string[]; minutes: number }
  >();

  for (const entry of sorted) {
    if (entry.treatment === "RETAINER") {
      running += entry.minutes;
      const cap = proration.includedMinutes;
      if (cap === null || running <= cap) {
        feeEntryIds.push(entry.id);
      } else if (agreement.overageRule === "ABSORBED") {
        feeEntryIds.push(entry.id);
      } else {
        overageEntryIds.push(entry.id);
        overageMinutes += Math.min(entry.minutes, running - cap);
      }
    } else if (entry.treatment === "HOURLY" || entry.treatment === "AT") {
      const groupKey = groupKeyOf(entry);
      const group = groups.get(groupKey) ?? {
        groupKey,
        entryIds: [],
        minutes: 0,
      };
      group.entryIds.push(entry.id);
      group.minutes += entry.minutes;
      groups.set(groupKey, group);
    }
  }

  return {
    feeEntryIds,
    overage: overageEntryIds.length
      ? { entryIds: overageEntryIds, minutes: overageMinutes }
      : null,
    outOfScope: [...groups.values()],
  };
}

export function priceMinutes(
  minutes: number,
  hourlyRate: Prisma.Decimal,
): Prisma.Decimal {
  return roundMoney(hourlyRate.mul(minutes).div(60));
}
