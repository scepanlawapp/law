import {
  RevenueConfiguration,
  RevenuePreviewResult,
  RevenuePreviewScenario,
  RevenueRate,
  RevenueAgreement,
  RevenueSpecialRule,
} from "@law/api-interfaces";
import { percentUnits } from "./revenue-sharing.validation";

const scopeRank = { FIRM: 1, MEMBER: 2, CLIENT: 3, CASE: 4, WORK_EVENT: 5 };
const validAt = (
  row: { effectiveFrom: string; effectiveTo: string | null },
  date: string,
) => row.effectiveFrom <= date && (!row.effectiveTo || row.effectiveTo >= date);
const rateUnits = (rate: RevenueRate) =>
  rate.state === "EXCLUDED"
    ? 0
    : rate.state === "PERCENTAGE" && rate.percentage !== null
      ? percentUnits(rate.percentage)
      : null;
const decimal = (units: number) => (units / 100).toFixed(2);
const cents = (amount: string) => {
  const [whole, fraction = ""] = amount.split(".");
  return BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, "0"));
};
const money = (amount: bigint) =>
  `${amount < BigInt(0) ? "-" : ""}${(amount < BigInt(0) ? -amount : amount) / BigInt(100)}.${String((amount < BigInt(0) ? -amount : amount) % BigInt(100)).padStart(2, "0")}`;

/** Pure, hypothetical preview. No database, ledger or payment side effects. */
export function previewRevenue(
  c: RevenueConfiguration,
  s: RevenuePreviewScenario,
): RevenuePreviewResult {
  const result: RevenuePreviewResult = {
    warnings: [],
    workPercentage: null,
    workAmount: null,
    originationPercentage: null,
    originationAmount: null,
    total: null,
    residual: null,
    appliedRuleIds: [],
    explanations: [
      "HYPOTHETICAL",
      c.entitlementDatePolicy,
      c.vatBasis,
      c.expenseTreatment,
    ],
  };
  const warn = (code: string) => {
    if (!result.warnings.includes(code)) result.warnings.push(code);
  };
  if (!c.enabled) {
    warn("DISABLED");
    return result;
  }
  const personal = c.configurationMode !== "SHARED_RULES";
  function agreementFor(memberId: string): RevenueAgreement | undefined {
    const matches = c.agreements.filter(
      (a) => a.memberId === memberId && validAt(a, s.referenceDate),
    );
    if (matches.length > 1) warn("AGREEMENT_OVERLAP");
    if (!matches.length && c.agreements.some((a) => a.memberId === memberId))
      warn("AGREEMENT_NOT_APPLICABLE");
    return matches[0];
  }
  const worker = agreementFor(s.memberId);
  if (s.agreementId && worker?.id !== s.agreementId) {
    warn("AGREEMENT_NOT_APPLICABLE");
    return result;
  }
  function baseRate(
    a: RevenueAgreement | undefined,
    field: RevenueRate,
    fallback: RevenueRate,
  ): number | null {
    if (a?.agreementType === "EXCLUDED") return 0;
    if (a?.agreementType === "UNCONFIGURED") return null;
    if (
      !personal ||
      !a ||
      a.agreementType === "INHERIT" ||
      field.state === "INHERIT"
    )
      return rateUnits(fallback);
    return rateUnits(field);
  }
  function departure(a: RevenueAgreement | undefined): boolean {
    if (
      !a ||
      s.revenueBasis !== "COLLECTED" ||
      a.departurePolicy === "RETAIN_EARNINGS_ON_PRIOR_WORK"
    )
      return false;
    const cutoff = a.departureCutoffDate ?? a.effectiveTo;
    if (cutoff && !s.collectionDate) {
      warn("COLLECTION_DATE_REQUIRED");
      return false;
    }
    return Boolean(cutoff && s.collectionDate && s.collectionDate > cutoff);
  }
  const scopeMatch = (r: RevenueSpecialRule) =>
    r.scopeType === "FIRM" ||
    (r.scopeType === "MEMBER" && r.scopeId === r.memberId) ||
    (r.scopeType === "CLIENT" && r.scopeId === s.clientId) ||
    (r.scopeType === "CASE" && r.scopeId === s.caseId) ||
    (r.scopeType === "WORK_EVENT" && r.scopeId === s.eventId);
  function resolve(
    memberId: string,
    category: "WORK_SHARE" | "ORIGINATION_BONUS",
    base: number | null,
    a: RevenueAgreement | undefined,
  ): number | null {
    if (a?.agreementType === "EXCLUDED" || departure(a)) {
      result.explanations.push("EXCLUDED");
      return 0;
    }
    if (c.configurationMode !== "ADVANCED") return base;
    const rules = c.specialRules.filter(
      (r) =>
        r.active &&
        r.memberId === memberId &&
        r.earningType === category &&
        (r.clientOrigin === null || r.clientOrigin === s.clientOrigin) &&
        r.revenueBasis === s.revenueBasis &&
        validAt(r, s.referenceDate) &&
        scopeMatch(r),
    );
    let resolved = base;
    let applied: string[] = [];
    for (const rank of [1, 2, 3, 4, 5]) {
      const matching = rules.filter((r) => scopeRank[r.scopeType] === rank);
      if (matching.length > 1) {
        warn("RULE_CONFLICT");
        return null;
      }
      const r = matching[0];
      if (!r) continue;
      if (r.combinationMode === "ADDITIVE") {
        resolved =
          resolved === null ? null : resolved + percentUnits(r.percentage);
        applied.push(r.id);
      } else {
        resolved = percentUnits(r.percentage);
        applied = [r.id];
      }
      result.explanations.push(r.scopeType, r.combinationMode);
    }
    result.appliedRuleIds.push(...applied);
    return resolved;
  }
  let work = baseRate(
    worker,
    worker?.rates[s.clientOrigin] ?? c.rates[s.clientOrigin],
    c.rates[s.clientOrigin],
  );
  work = resolve(s.memberId, "WORK_SHARE", work, worker);
  if (worker) result.appliedRuleIds.push(worker.id);
  result.explanations.push(worker?.agreementType ?? "FIRM_DEFAULT");
  let bonus: number | null = 0;
  if (c.originationEnabled) {
    if (
      (s.clientOrigin === "OWN_CLIENT" && s.originatorId !== s.memberId) ||
      (s.clientOrigin === "OTHER_ATTORNEY_CLIENT" &&
        (!s.originatorId || s.originatorId === s.memberId))
    )
      warn("ORIGINATOR_REQUIRED");
    const originator = s.originatorId
      ? agreementFor(s.originatorId)
      : undefined;
    const self = s.originatorId === s.memberId;
    const selfAllowed =
      personal && originator?.agreementType === "INDIVIDUAL"
        ? (originator.selfOrigination ?? c.selfOrigination)
        : c.selfOrigination;
    const bonusApplies =
      s.originatorId && (self ? selfAllowed : c.originationOnOthersWork);
    if (bonusApplies && s.originatorId) {
      const override =
        personal &&
        c.allowPersonalOriginationOverride &&
        originator?.agreementType === "INDIVIDUAL"
          ? originator.originationRate
          : undefined;
      bonus = baseRate(
        originator,
        override ?? { state: "INHERIT", percentage: null },
        c.originationRate,
      );
      bonus = resolve(s.originatorId, "ORIGINATION_BONUS", bonus, originator);
      if (originator) result.appliedRuleIds.push(originator.id);
    } else result.explanations.push("NO_ORIGINATION_BONUS");
  }
  if (s.specialRuleId && !result.appliedRuleIds.includes(s.specialRuleId))
    warn("RULE_NOT_APPLICABLE");
  if (work === null || bonus === null) warn("REQUIRES_CONFIGURATION");
  if (result.warnings.length || work === null || bonus === null) return result;
  result.workPercentage = decimal(work);
  result.originationPercentage = decimal(bonus);
  const amount = cents(s.amount);
  const allocation = (rate: number) =>
    (amount * BigInt(rate) + BigInt(5000)) / BigInt(10000);
  const workAmount = allocation(work);
  let bonusAmount = allocation(bonus);
  // Round to cents without creating a negative residual from independent rounding.
  if (work + bonus <= 10000 && workAmount + bonusAmount > amount)
    bonusAmount = amount - workAmount;
  result.workAmount = money(workAmount);
  result.originationAmount = money(bonusAmount);
  result.total = money(workAmount + bonusAmount);
  result.residual =
    work + bonus <= 10000 ? money(amount - workAmount - bonusAmount) : null;
  if (result.residual === null)
    result.explanations.push("BONUSES_OUTSIDE_POOL");
  return result;
}
