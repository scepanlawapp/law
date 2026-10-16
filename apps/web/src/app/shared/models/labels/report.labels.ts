import { LabelMap } from "../select-option";
import { SortFields, SortKind } from "../sort";
import {
  ProfitabilityRangePreset,
  ReportAllocationCategory,
  ReportAllocationReason,
  ReportCollectionStatus,
  ReportDateBasis,
  ReportGroup,
  ReportPeriodPreset,
  ReportSharing,
  ReportView,
  ReportWorkStatus,
} from "../types/report";

export const REPORT_DATE_BASIS_LABELS: LabelMap<ReportDateBasis> = {
  [ReportDateBasis.WORK]: "report.basis.work",
  [ReportDateBasis.INVOICE]: "report.basis.invoice",
  [ReportDateBasis.COLLECTION]: "report.basis.collection",
};

export const REPORT_DATE_BASIS_HELP_LABELS: LabelMap<ReportDateBasis> = {
  [ReportDateBasis.WORK]: "report.basisHelp.work",
  [ReportDateBasis.INVOICE]: "report.basisHelp.invoice",
  [ReportDateBasis.COLLECTION]: "report.basisHelp.collection",
};

export const REPORT_GROUP_LABELS: LabelMap<ReportGroup> = {
  [ReportGroup.DAY]: "report.group.day",
  [ReportGroup.WEEK]: "report.group.week",
  [ReportGroup.MONTH]: "report.group.month",
};

export const REPORT_COLLECTION_STATUS_LABELS: LabelMap<ReportCollectionStatus> =
  {
    [ReportCollectionStatus.NOT_INVOICED]: "report.enum.NotInvoiced",
    [ReportCollectionStatus.PARTIALLY_COLLECTED]:
      "report.enum.PartiallyCollected",
    [ReportCollectionStatus.UNCOLLECTED]: "report.enum.Uncollected",
    [ReportCollectionStatus.FULLY_COLLECTED]: "report.enum.FullyCollected",
    [ReportCollectionStatus.REQUIRES_CONFIGURATION]:
      "report.enum.RequiresConfiguration",
  };

export const REPORT_SHARING_LABELS: LabelMap<ReportSharing> = {
  [ReportSharing.CONFIGURED]: "report.enum.configured",
  [ReportSharing.EXCLUDED]: "report.enum.excluded",
  [ReportSharing.MISSING]: "report.enum.missing",
};

export const REPORT_WORK_STATUS_LABELS: LabelMap<ReportWorkStatus> = {
  [ReportWorkStatus.COMPLETED]: "report.enum.completed",
  [ReportWorkStatus.PLANNED]: "report.enum.planned",
};

export const REPORT_ALLOCATION_CATEGORY_LABELS: LabelMap<ReportAllocationCategory> =
  {
    [ReportAllocationCategory.WORK_SHARE]: "report.category.workShare",
    [ReportAllocationCategory.ORIGINATION]: "report.category.origination",
    [ReportAllocationCategory.CONTRACTUAL]: "report.category.contractual",
  };

/** Why an allocation applies; a missing reason falls back to its category. */
export const REPORT_ALLOCATION_REASON_LABELS: LabelMap<
  ReportAllocationReason | ReportAllocationCategory
> = {
  [ReportAllocationReason.OWN_CLIENT]: "report.reason.ownClient",
  [ReportAllocationReason.OTHER_CLIENT]: "report.reason.otherClient",
  [ReportAllocationReason.ORIGINATION]: "report.reason.origination",
  [ReportAllocationReason.CONTRACTUAL]: "report.reason.contractual",
  [ReportAllocationCategory.WORK_SHARE]: "report.reason.workShare",
};

export const REPORT_VIEW_LABELS: LabelMap<ReportView> = {
  [ReportView.OVERVIEW]: "report.overview",
  [ReportView.EARNINGS]: "report.earnings",
  [ReportView.OUTSTANDING]: "report.outstanding",
  [ReportView.PERSONAL]: "report.personal",
  [ReportView.DETAIL]: "report.detail",
};

export const REPORT_VIEW_DESCRIPTION_LABELS: LabelMap<ReportView> = {
  [ReportView.OVERVIEW]: "report.overview.description",
  [ReportView.EARNINGS]: "report.earnings.description",
  [ReportView.OUTSTANDING]: "report.outstanding.description",
  [ReportView.PERSONAL]: "report.personal.description",
  [ReportView.DETAIL]: "report.detail.description",
};

export const REPORT_PERIOD_PRESET_LABELS: LabelMap<ReportPeriodPreset> = {
  [ReportPeriodPreset.CURRENT]: "report.current",
  [ReportPeriodPreset.LAST]: "report.last",
  [ReportPeriodPreset.THREE]: "report.three",
  [ReportPeriodPreset.YEAR]: "report.year",
};

/** Invoice-age buckets: up to 30, 60, 90 days, and older. */
export const REPORT_AGE_BUCKET_LABELS: readonly string[] = [
  "report.age.0",
  "report.age.1",
  "report.age.2",
  "report.age.3",
];

export const PROFITABILITY_RANGE_PRESET_LABELS: LabelMap<ProfitabilityRangePreset> =
  {
    [ProfitabilityRangePreset.LAST_MONTH]:
      "reports.profitability.presetLastMonth",
    [ProfitabilityRangePreset.THIS_MONTH]:
      "reports.profitability.presetThisMonth",
    [ProfitabilityRangePreset.LAST_3_MONTHS]:
      "reports.profitability.presetLast3Months",
    [ProfitabilityRangePreset.CUSTOM]: "reports.profitability.presetCustom",
  };

export const REPORT_WORK_SORT_FIELDS = {
  caseName: { label: "report.caseClient", kind: SortKind.TEXT },
  workDate: { label: "report.workDate", kind: SortKind.DATE },
  estimated: { label: "report.estimated", kind: SortKind.NUMBER },
  invoiced: { label: "report.invoiced", kind: SortKind.NUMBER },
  collected: { label: "report.collected", kind: SortKind.NUMBER },
  balance: { label: "report.balance", kind: SortKind.NUMBER },
  potential: { label: "report.potential", kind: SortKind.NUMBER },
  shareCollected: { label: "report.shareCollected", kind: SortKind.NUMBER },
} as const satisfies SortFields<string>;
export type ReportWorkSortField = keyof typeof REPORT_WORK_SORT_FIELDS;

export const REPORT_EARNINGS_SORT_FIELDS = {
  name: { label: "report.attorney", kind: SortKind.TEXT },
  invoiced: { label: "report.invoiced", kind: SortKind.NUMBER },
  collected: { label: "report.collected", kind: SortKind.NUMBER },
  shareInvoiced: { label: "report.shareInvoiced", kind: SortKind.NUMBER },
  shareCollected: { label: "report.shareCollected", kind: SortKind.NUMBER },
  potential: { label: "report.potential", kind: SortKind.NUMBER },
  origination: { label: "report.origination", kind: SortKind.NUMBER },
} as const satisfies SortFields<string>;
export type ReportEarningsSortField = keyof typeof REPORT_EARNINGS_SORT_FIELDS;
