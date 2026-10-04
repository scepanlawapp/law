import type {
  RetainerAgreement,
  RetainerRule,
  WorkEntryTreatment,
} from "@law/api-interfaces";

/**
 * Client-side port of `libs/api/features/work-entries/src/lib/treatment.ts`.
 * It only pre-fills the form; the API recomputes and owns the stored value.
 */
export interface AgreementTerms {
  validFrom: Date;
  validTo: Date | null;
  coveredCategoryIds: string[];
  outOfScopeRule: RetainerRule;
}

/** Active agreements of a client, as the API would load them for defaults. */
export function agreementTerms(
  agreements: RetainerAgreement[],
): AgreementTerms[] {
  return agreements
    .filter((agreement) => agreement.active)
    .map((agreement) => ({
      validFrom: new Date(agreement.validFrom),
      validTo: agreement.validTo ? new Date(agreement.validTo) : null,
      coveredCategoryIds: agreement.coveredCategoryIds,
      outOfScopeRule: agreement.outOfScopeRule,
    }));
}

/**
 * Agreement whose [validFrom, validTo] range contains `workDate` (calendar
 * dates, compared as UTC instants). If ranges overlap the latest validFrom wins.
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
