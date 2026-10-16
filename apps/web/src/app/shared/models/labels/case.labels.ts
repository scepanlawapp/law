import {
  ActivitySource,
  ActivityType,
  CasePriority,
  CaseStatus,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";
import { SortFields, SortKind } from "../sort";

export const CASE_STATUS_LABELS: LabelMap<CaseStatus> = {
  [CaseStatus.DRAFT]: "cases.status.DRAFT",
  [CaseStatus.ACTIVE]: "cases.status.ACTIVE",
  [CaseStatus.ON_HOLD]: "cases.status.ON_HOLD",
  [CaseStatus.CLOSED]: "cases.status.CLOSED",
  [CaseStatus.ARCHIVED]: "cases.status.ARCHIVED",
};

export const CASE_PRIORITY_LABELS: LabelMap<CasePriority> = {
  [CasePriority.LOW]: "cases.priority.LOW",
  [CasePriority.NORMAL]: "cases.priority.NORMAL",
  [CasePriority.HIGH]: "cases.priority.HIGH",
  [CasePriority.URGENT]: "cases.priority.URGENT",
};

export const ACTIVITY_TYPE_LABELS: LabelMap<ActivityType> = {
  [ActivityType.NOTE]: "cases.activity.type.NOTE",
  [ActivityType.PHONE_CALL]: "cases.activity.type.PHONE_CALL",
  [ActivityType.MEETING]: "cases.activity.type.MEETING",
  [ActivityType.EMAIL]: "cases.activity.type.EMAIL",
  [ActivityType.OTHER]: "cases.activity.type.OTHER",
};

export const ACTIVITY_SOURCE_LABELS: LabelMap<ActivitySource> = {
  [ActivitySource.MANUAL]: "cases.activity.source.MANUAL",
  [ActivitySource.SYSTEM]: "cases.activity.source.SYSTEM",
  [ActivitySource.AI]: "cases.activity.source.AI",
};

/** Activity types that record how long the contact took. */
export const TIMED_ACTIVITY_TYPES: readonly ActivityType[] = [
  ActivityType.PHONE_CALL,
  ActivityType.MEETING,
  ActivityType.EMAIL,
];

export const CASE_SORT_FIELDS = {
  updatedAt: { label: "cases.field.updatedAt", kind: SortKind.DATE },
  caseNumber: { label: "cases.field.caseNumber", kind: SortKind.TEXT },
  name: { label: "cases.field.name", kind: SortKind.TEXT },
} as const satisfies SortFields<string>;
export type CaseSortField = keyof typeof CASE_SORT_FIELDS;
