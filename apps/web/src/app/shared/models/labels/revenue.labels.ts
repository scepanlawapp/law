import {
  REVENUE_AGREEMENT_TYPES,
  REVENUE_BASES,
  REVENUE_CATEGORIES,
  REVENUE_COMBINATIONS,
  REVENUE_DEPARTURE_POLICIES,
  REVENUE_MODES,
  REVENUE_ORIGINS,
  REVENUE_RATE_STATES,
  REVENUE_SCOPES,
  WorkspaceRole,
  REVENUE_ENTITLEMENT_DATE_POLICIES,
  REVENUE_EXPENSE_TREATMENTS,
  REVENUE_MISSING_RULE_POLICIES,
  REVENUE_PARTIAL_PAYMENT_POLICIES,
  REVENUE_VAT_BASES,
  RevenueMemberStatus,
  RevenueRateState,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";
import {
  RevenueMemberFilter,
  RevenueRuleActivity,
  RevenueSelfOrigination,
  RevenueTab,
  RevenueVersionStatus,
} from "../types/revenue";

/** Every revenue enum value is translated as `revenue.enum.<VALUE>`. */
function revenueEnumLabels<TValue extends string>(
  values: readonly TValue[],
): LabelMap<TValue> {
  return Object.fromEntries(
    values.map((value) => [value, `revenue.enum.${value}`]),
  ) as LabelMap<TValue>;
}

const values = <T extends Record<string, string>>(object: T) =>
  Object.values(object) as T[keyof T][];

export const REVENUE_ORIGIN_LABELS = revenueEnumLabels(REVENUE_ORIGINS);
export const REVENUE_MODE_LABELS = revenueEnumLabels(REVENUE_MODES);
export const REVENUE_BASIS_LABELS = revenueEnumLabels(REVENUE_BASES);
export const REVENUE_SCOPE_LABELS = revenueEnumLabels(REVENUE_SCOPES);
export const REVENUE_CATEGORY_LABELS = revenueEnumLabels(REVENUE_CATEGORIES);
export const REVENUE_COMBINATION_LABELS =
  revenueEnumLabels(REVENUE_COMBINATIONS);
export const REVENUE_AGREEMENT_TYPE_LABELS = revenueEnumLabels(
  REVENUE_AGREEMENT_TYPES,
);
export const REVENUE_DEPARTURE_POLICY_LABELS = revenueEnumLabels(
  REVENUE_DEPARTURE_POLICIES,
);
export const REVENUE_RATE_STATE_LABELS = revenueEnumLabels(REVENUE_RATE_STATES);
export const REVENUE_VAT_BASIS_LABELS = revenueEnumLabels(REVENUE_VAT_BASES);
export const REVENUE_EXPENSE_TREATMENT_LABELS = revenueEnumLabels(
  REVENUE_EXPENSE_TREATMENTS,
);
export const REVENUE_PARTIAL_PAYMENT_POLICY_LABELS = revenueEnumLabels(
  REVENUE_PARTIAL_PAYMENT_POLICIES,
);
export const REVENUE_ENTITLEMENT_DATE_POLICY_LABELS = revenueEnumLabels(
  REVENUE_ENTITLEMENT_DATE_POLICIES,
);
export const REVENUE_MISSING_RULE_POLICY_LABELS = revenueEnumLabels(
  REVENUE_MISSING_RULE_POLICIES,
);
export const REVENUE_MEMBER_FILTER_LABELS = revenueEnumLabels(
  values(RevenueMemberFilter),
);
export const REVENUE_SELF_ORIGINATION_LABELS = revenueEnumLabels(
  values(RevenueSelfOrigination),
);
export const REVENUE_RULE_ACTIVITY_LABELS = revenueEnumLabels(
  values(RevenueRuleActivity),
);
export const REVENUE_MEMBER_STATUS_LABELS = revenueEnumLabels(
  values(RevenueMemberStatus),
);
export const REVENUE_ROLE_LABELS = revenueEnumLabels(values(WorkspaceRole));

/** Rate states offered for the shared office rates. */
export const REVENUE_DEFAULT_RATE_STATES = [
  RevenueRateState.UNCONFIGURED,
  RevenueRateState.EXCLUDED,
  RevenueRateState.PERCENTAGE,
] as const;

/** Rate states offered for a personal agreement, which may inherit. */
export const REVENUE_AGREEMENT_RATE_STATES = [
  RevenueRateState.INHERIT,
  ...REVENUE_DEFAULT_RATE_STATES,
] as const;

/** Server explanation codes of a revenue preview. */
export const REVENUE_PREVIEW_EXPLANATION_LABELS = revenueEnumLabels([
  "HYPOTHETICAL",
  "FIRM_DEFAULT",
  "NO_ORIGINATION_BONUS",
  "BONUSES_OUTSIDE_POOL",
]);

/** Any revenue enum value, for generic diffs and read-only version views. */
export const REVENUE_ENUM_LABELS: Readonly<Record<string, string>> = {
  ...REVENUE_ORIGIN_LABELS,
  ...REVENUE_MODE_LABELS,
  ...REVENUE_BASIS_LABELS,
  ...REVENUE_SCOPE_LABELS,
  ...REVENUE_CATEGORY_LABELS,
  ...REVENUE_COMBINATION_LABELS,
  ...REVENUE_AGREEMENT_TYPE_LABELS,
  ...REVENUE_DEPARTURE_POLICY_LABELS,
  ...REVENUE_RATE_STATE_LABELS,
  ...REVENUE_VAT_BASIS_LABELS,
  ...REVENUE_EXPENSE_TREATMENT_LABELS,
  ...REVENUE_PARTIAL_PAYMENT_POLICY_LABELS,
  ...REVENUE_ENTITLEMENT_DATE_POLICY_LABELS,
  ...REVENUE_MISSING_RULE_POLICY_LABELS,
  ...REVENUE_MEMBER_FILTER_LABELS,
  ...REVENUE_SELF_ORIGINATION_LABELS,
  ...REVENUE_RULE_ACTIVITY_LABELS,
  ...REVENUE_MEMBER_STATUS_LABELS,
  ...REVENUE_ROLE_LABELS,
  ...REVENUE_PREVIEW_EXPLANATION_LABELS,
};

export const REVENUE_TAB_LABELS: LabelMap<RevenueTab> = {
  [RevenueTab.OVERVIEW]: "revenue.tab.overview",
  [RevenueTab.MODELS]: "revenue.tab.models",
  [RevenueTab.TEAM]: "revenue.tab.team",
  [RevenueTab.SPECIAL]: "revenue.tab.special",
  [RevenueTab.HISTORY]: "revenue.tab.history",
};

export const REVENUE_VERSION_STATUS_LABELS: LabelMap<RevenueVersionStatus> = {
  [RevenueVersionStatus.CURRENT]: "revenue.versionStatus.CURRENT",
  [RevenueVersionStatus.SCHEDULED]: "revenue.versionStatus.SCHEDULED",
  [RevenueVersionStatus.HISTORICAL]: "revenue.versionStatus.HISTORICAL",
  [RevenueVersionStatus.UNKNOWN]: "revenue.versionStatus.UNKNOWN",
};
