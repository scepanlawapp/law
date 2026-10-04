import type { RetainerRule, WorkEntryTreatment } from "@law/api-interfaces";
import type { Prisma } from "@prisma/client";

export interface AgreementTerms {
  id: string;
  validFrom: Date;
  validTo: Date | null;
  monthlyFee: Prisma.Decimal;
  currency: string;
  includedMinutes: number | null;
  coveredCategoryIds: string[];
  overageRule: RetainerRule;
  overageHourlyRate: Prisma.Decimal | null;
  outOfScopeRule: RetainerRule;
  outOfScopeHourlyRate: Prisma.Decimal | null;
}

/**
 * Agreement whose [validFrom, validTo] range contains `workDate` (calendar
 * dates, compared as UTC instants). Overlaps should not exist; if they do the
 * latest validFrom wins.
 */
export function activeAgreementOn(
  agreements: AgreementTerms[],
  workDate: Date,
): AgreementTerms | null {
  const time = workDate.getTime();
  let active: AgreementTerms | null = null;
  for (const agreement of agreements) {
    if (agreement.validFrom.getTime() > time) continue;
    if (agreement.validTo && agreement.validTo.getTime() < time) continue;
    if (!active || agreement.validFrom.getTime() > active.validFrom.getTime()) {
      active = agreement;
    }
  }
  return active;
}

export function defaultTreatment(
  agreement: AgreementTerms | null,
  serviceCategoryId: string | null,
): WorkEntryTreatment {
  if (!agreement) return "UNDECIDED";
  const covers =
    agreement.coveredCategoryIds.length === 0 ||
    (serviceCategoryId !== null &&
      agreement.coveredCategoryIds.includes(serviceCategoryId));
  if (covers) return "RETAINER";
  switch (agreement.outOfScopeRule) {
    case "HOURLY":
      return "HOURLY";
    case "AT":
      return "AT";
    case "ABSORBED":
      return "RETAINER";
  }
}
