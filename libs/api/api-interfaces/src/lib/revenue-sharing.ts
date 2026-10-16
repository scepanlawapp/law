import { enumOf } from "./enum-of";
import type { PaginatedResponse } from "./api-interfaces";

/** Configuration only. Percentages are exact base-10 strings, never stored as floats. */
export const REVENUE_ORIGINS = [
  "OWN_CLIENT",
  "OTHER_ATTORNEY_CLIENT",
  "OFFICE_CLIENT",
  "UNKNOWN_ORIGIN",
] as const;
export type RevenueOrigin = (typeof REVENUE_ORIGINS)[number];
export const RevenueOrigin = enumOf(REVENUE_ORIGINS);
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

export const REVENUE_VAT_BASES = ["EXCLUDING_VAT", "INCLUDING_VAT"] as const;
export const REVENUE_EXPENSE_TREATMENTS = ["EXCLUDE", "INCLUDE"] as const;
export const REVENUE_PARTIAL_PAYMENT_POLICIES = [
  "PROPORTIONAL",
  "MANUAL",
] as const;
export const REVENUE_ENTITLEMENT_DATE_POLICIES = [
  "WORK_EXECUTION_DATE",
  "INVOICE_DATE",
  "COLLECTION_DATE",
] as const;
export const REVENUE_MISSING_RULE_POLICIES = [
  "REQUIRES_CONFIGURATION",
] as const;
export const REVENUE_MEMBER_STATUSES = ["ACTIVE", "FORMER", "INVITED"] as const;
export type RevenueMode = (typeof REVENUE_MODES)[number];
export const RevenueMode = enumOf(REVENUE_MODES);
export type RevenueBasis = (typeof REVENUE_BASES)[number];
export const RevenueBasis = enumOf(REVENUE_BASES);
export type RevenueScope = (typeof REVENUE_SCOPES)[number];
export const RevenueScope = enumOf(REVENUE_SCOPES);
export type RevenueCategory = (typeof REVENUE_CATEGORIES)[number];
export const RevenueCategory = enumOf(REVENUE_CATEGORIES);
export type RevenueCombination = (typeof REVENUE_COMBINATIONS)[number];
export const RevenueCombination = enumOf(REVENUE_COMBINATIONS);
export type RevenueAgreementType = (typeof REVENUE_AGREEMENT_TYPES)[number];
export const RevenueAgreementType = enumOf(REVENUE_AGREEMENT_TYPES);
export type RevenueDeparturePolicy =
  (typeof REVENUE_DEPARTURE_POLICIES)[number];
export const RevenueDeparturePolicy = enumOf(REVENUE_DEPARTURE_POLICIES);
export type RevenueRateState = (typeof REVENUE_RATE_STATES)[number];
export const RevenueRateState = enumOf(REVENUE_RATE_STATES);
export type RevenueVatBasis = (typeof REVENUE_VAT_BASES)[number];
export const RevenueVatBasis = enumOf(REVENUE_VAT_BASES);
export type RevenueExpenseTreatment =
  (typeof REVENUE_EXPENSE_TREATMENTS)[number];
export const RevenueExpenseTreatment = enumOf(REVENUE_EXPENSE_TREATMENTS);
export type RevenuePartialPaymentPolicy =
  (typeof REVENUE_PARTIAL_PAYMENT_POLICIES)[number];
export const RevenuePartialPaymentPolicy = enumOf(
  REVENUE_PARTIAL_PAYMENT_POLICIES,
);
export type RevenueEntitlementDatePolicy =
  (typeof REVENUE_ENTITLEMENT_DATE_POLICIES)[number];
export const RevenueEntitlementDatePolicy = enumOf(
  REVENUE_ENTITLEMENT_DATE_POLICIES,
);
export type RevenueMissingRulePolicy =
  (typeof REVENUE_MISSING_RULE_POLICIES)[number];
export const RevenueMissingRulePolicy = enumOf(REVENUE_MISSING_RULE_POLICIES);
export type RevenueMemberStatus = (typeof REVENUE_MEMBER_STATUSES)[number];
export const RevenueMemberStatus = enumOf(REVENUE_MEMBER_STATUSES);
export interface RevenueRate {
  state: RevenueRateState;
  percentage: string | null;
}
export type RevenueRates = Record<RevenueOrigin, RevenueRate>;
export interface RevenueAgreement {
  id: string;
  memberId: string;
  agreementType: RevenueAgreementType;
  effectiveFrom: string;
  effectiveTo: string | null;
  rates: RevenueRates;
  originationRate: RevenueRate;
  selfOrigination: boolean | null;
  departurePolicy: RevenueDeparturePolicy;
  departureCutoffDate: string | null;
  description: string;
}
export interface RevenueSpecialRule {
  id: string;
  scopeType: RevenueScope;
  scopeId: string | null;
  memberId: string;
  earningType: RevenueCategory;
  clientOrigin: RevenueOrigin | null;
  percentage: string;
  revenueBasis: RevenueBasis;
  combinationMode: RevenueCombination;
  /** Required only for EXCLUSIVE_SPLIT; allocations in the same pool may total at most 100%. */
  poolId: string | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  active: boolean;
  description: string;
}
export interface RevenueConfiguration {
  enabled: boolean;
  configurationMode: RevenueMode;
  primaryRevenueBasis: RevenueBasis;
  vatBasis: RevenueVatBasis;
  expenseTreatment: RevenueExpenseTreatment;
  partialPaymentPolicy: RevenuePartialPaymentPolicy;
  entitlementDatePolicy: RevenueEntitlementDatePolicy;
  missingRulePolicy: RevenueMissingRulePolicy;
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
  revenueBasis: RevenueBasis;
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

export interface RevenueVersionListQuery {
  page?: number;
  pageSize?: number;
}
export type RevenueVersionListResponse = PaginatedResponse<RevenueHistoryEntry>;
