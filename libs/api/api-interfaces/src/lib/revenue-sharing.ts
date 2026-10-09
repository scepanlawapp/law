/** Configuration only. Percentages are exact base-10 strings, never stored as floats. */
export const REVENUE_ORIGINS = [
  "OWN_CLIENT",
  "OTHER_ATTORNEY_CLIENT",
  "OFFICE_CLIENT",
  "UNKNOWN_ORIGIN",
] as const;
export type RevenueOrigin = (typeof REVENUE_ORIGINS)[number];
export const REVENUE_MODES = [
  "SHARED_RULES",
  "INDIVIDUAL_AGREEMENTS",
  "ADVANCED",
] as const;
export const REVENUE_BASES = ["INVOICED", "COLLECTED"] as const;
export const REVENUE_SCOPES = [
  "FIRM",
  "MEMBER",
  "CLIENT",
  "CASE",
  "WORK_EVENT",
] as const;
export const REVENUE_CATEGORIES = ["WORK_SHARE", "ORIGINATION_BONUS"] as const;
export const REVENUE_COMBINATIONS = [
  "OVERRIDE",
  "ADDITIVE",
  "EXCLUSIVE_SPLIT",
] as const;
export const REVENUE_AGREEMENT_TYPES = [
  "INHERIT",
  "INDIVIDUAL",
  "EXCLUDED",
  "UNCONFIGURED",
] as const;
export const REVENUE_DEPARTURE_POLICIES = [
  "RETAIN_EARNINGS_ON_PRIOR_WORK",
  "STOP_AT_DEPARTURE",
  "CUSTOM_DEPARTURE_AGREEMENT",
] as const;
export const REVENUE_RATE_STATES = [
  "UNCONFIGURED",
  "INHERIT",
  "EXCLUDED",
  "PERCENTAGE",
] as const;
export interface RevenueRate {
  state: (typeof REVENUE_RATE_STATES)[number];
  percentage: string | null;
}
export type RevenueRates = Record<RevenueOrigin, RevenueRate>;
export interface RevenueAgreement {
  id: string;
  memberId: string;
  agreementType: (typeof REVENUE_AGREEMENT_TYPES)[number];
  effectiveFrom: string;
  effectiveTo: string | null;
  rates: RevenueRates;
  originationRate: RevenueRate;
  selfOrigination: boolean | null;
  departurePolicy: (typeof REVENUE_DEPARTURE_POLICIES)[number];
  departureCutoffDate: string | null;
  description: string;
}
export interface RevenueSpecialRule {
  id: string;
  scopeType: (typeof REVENUE_SCOPES)[number];
  scopeId: string | null;
  memberId: string;
  earningType: (typeof REVENUE_CATEGORIES)[number];
  clientOrigin: RevenueOrigin | null;
  percentage: string;
  revenueBasis: (typeof REVENUE_BASES)[number];
  combinationMode: (typeof REVENUE_COMBINATIONS)[number];
  /** Required only for EXCLUSIVE_SPLIT; allocations in the same pool may total at most 100%. */
  poolId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  description: string;
}
export interface RevenueConfiguration {
  enabled: boolean;
  configurationMode: (typeof REVENUE_MODES)[number];
  primaryRevenueBasis: (typeof REVENUE_BASES)[number];
  vatBasis: "EXCLUDING_VAT" | "INCLUDING_VAT";
  expenseTreatment: "EXCLUDE" | "INCLUDE";
  partialPaymentPolicy: "PROPORTIONAL" | "MANUAL";
  entitlementDatePolicy:
    | "WORK_EXECUTION_DATE"
    | "INVOICE_DATE"
    | "COLLECTION_DATE";
  missingRulePolicy: "REQUIRES_CONFIGURATION";
  rates: RevenueRates;
  originationEnabled: boolean;
  originationRate: RevenueRate;
  originationOnOthersWork: boolean;
  selfOrigination: boolean;
  allowPersonalOriginationOverride: boolean;
  agreements: RevenueAgreement[];
  specialRules: RevenueSpecialRule[];
}
export interface RevenueMember {
  id: string;
  name: string;
  role: string;
  status: string;
}
export interface RevenueSettingsResponse {
  version: number;
  effectiveFrom: string | null;
  configuration: RevenueConfiguration;
}
export interface RevenuePublishRequest {
  expectedVersion: number;
  effectiveFrom: string;
  reason: string;
  configuration: RevenueConfiguration;
}
export interface RevenueHistoryEntry extends RevenueSettingsResponse {
  id: string;
  createdAt: string;
  changedBy: string;
  reason: string;
}
export interface RevenueReference {
  id: string;
  name: string;
}
export interface RevenueReferences {
  members: RevenueMember[];
  clients: RevenueReference[];
  cases: RevenueReference[];
  events: RevenueReference[];
}
export interface RevenuePreviewScenario {
  amount: string;
  revenueBasis: (typeof REVENUE_BASES)[number];
  memberId: string;
  clientOrigin: RevenueOrigin;
  originatorId: string | null;
  referenceDate: string;
  collectionDate: string | null;
  clientId: string | null;
  caseId: string | null;
  eventId: string | null;
  agreementId: string | null;
  specialRuleId: string | null;
}
export interface RevenuePreviewRequest {
  configuration?: RevenueConfiguration;
  scenario: RevenuePreviewScenario;
}
export interface RevenuePreviewResult {
  warnings: string[];
  workPercentage: string | null;
  workAmount: string | null;
  originationPercentage: string | null;
  originationAmount: string | null;
  total: string | null;
  residual: string | null;
  appliedRuleIds: string[];
  explanations: string[];
}
export function revenueEmptyRates(inherit = false): RevenueRates {
  return Object.fromEntries(
    REVENUE_ORIGINS.map((origin) => [
      origin,
      { state: inherit ? "INHERIT" : "UNCONFIGURED", percentage: null },
    ]),
  ) as RevenueRates;
}
export function defaultRevenueConfiguration(): RevenueConfiguration {
  return {
    enabled: false,
    configurationMode: "SHARED_RULES",
    primaryRevenueBasis: "COLLECTED",
    vatBasis: "EXCLUDING_VAT",
    expenseTreatment: "EXCLUDE",
    partialPaymentPolicy: "PROPORTIONAL",
    entitlementDatePolicy: "WORK_EXECUTION_DATE",
    missingRulePolicy: "REQUIRES_CONFIGURATION",
    rates: revenueEmptyRates(),
    originationEnabled: false,
    originationRate: { state: "UNCONFIGURED", percentage: null },
    originationOnOthersWork: true,
    selfOrigination: false,
    allowPersonalOriginationOverride: false,
    agreements: [],
    specialRules: [],
  };
}
