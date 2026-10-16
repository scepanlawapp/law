/** UI-only enums of the reports screens; the report prototype has no API contract yet. */

export const ReportDateBasis = {
  WORK: "work",
  INVOICE: "invoice",
  COLLECTION: "collection",
} as const;
export type ReportDateBasis =
  (typeof ReportDateBasis)[keyof typeof ReportDateBasis];

export const ReportCollectionStatus = {
  NOT_INVOICED: "NotInvoiced",
  PARTIALLY_COLLECTED: "PartiallyCollected",
  UNCOLLECTED: "Uncollected",
  FULLY_COLLECTED: "FullyCollected",
  REQUIRES_CONFIGURATION: "RequiresConfiguration",
} as const;
export type ReportCollectionStatus =
  (typeof ReportCollectionStatus)[keyof typeof ReportCollectionStatus];

export const ReportAllocationCategory = {
  WORK_SHARE: "workShare",
  ORIGINATION: "origination",
  CONTRACTUAL: "contractual",
} as const;
export type ReportAllocationCategory =
  (typeof ReportAllocationCategory)[keyof typeof ReportAllocationCategory];

export const ReportAllocationReason = {
  OWN_CLIENT: "ownClient",
  OTHER_CLIENT: "otherClient",
  ORIGINATION: "origination",
  CONTRACTUAL: "contractual",
} as const;
export type ReportAllocationReason =
  (typeof ReportAllocationReason)[keyof typeof ReportAllocationReason];

export const ReportWorkStatus = {
  COMPLETED: "completed",
  PLANNED: "planned",
} as const;
export type ReportWorkStatus =
  (typeof ReportWorkStatus)[keyof typeof ReportWorkStatus];

export const ReportSharing = {
  CONFIGURED: "configured",
  EXCLUDED: "excluded",
  MISSING: "missing",
} as const;
export type ReportSharing = (typeof ReportSharing)[keyof typeof ReportSharing];

export const ReportGroup = {
  DAY: "day",
  WEEK: "week",
  MONTH: "month",
} as const;
export type ReportGroup = (typeof ReportGroup)[keyof typeof ReportGroup];

export const ReportView = {
  OVERVIEW: "overview",
  EARNINGS: "earnings",
  OUTSTANDING: "outstanding",
  PERSONAL: "personal",
  DETAIL: "detail",
} as const;
export type ReportView = (typeof ReportView)[keyof typeof ReportView];

export const ReportPeriodPreset = {
  CURRENT: "current",
  LAST: "last",
  THREE: "three",
  YEAR: "year",
} as const;
export type ReportPeriodPreset =
  (typeof ReportPeriodPreset)[keyof typeof ReportPeriodPreset];

export const ProfitabilityRangePreset = {
  LAST_MONTH: "LAST_MONTH",
  THIS_MONTH: "THIS_MONTH",
  LAST_3_MONTHS: "LAST_3_MONTHS",
  CUSTOM: "CUSTOM",
} as const;
export type ProfitabilityRangePreset =
  (typeof ProfitabilityRangePreset)[keyof typeof ProfitabilityRangePreset];
