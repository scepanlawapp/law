import {
  PriceSuggestionConfidence,
  TimeReviewReason,
  WorkEntryDeleteBlockedReason,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";

export const WORK_ENTRY_STATUS_LABELS: LabelMap<WorkEntryStatus> = {
  [WorkEntryStatus.RUNNING]: "time.status.running",
  [WorkEntryStatus.PROPOSED]: "time.status.proposed",
  [WorkEntryStatus.CONFIRMED]: "time.status.confirmed",
  [WorkEntryStatus.BILLED]: "time.status.billed",
  [WorkEntryStatus.WRITTEN_OFF]: "time.status.writtenOff",
};

export const WORK_ENTRY_TREATMENT_LABELS: LabelMap<WorkEntryTreatment> = {
  [WorkEntryTreatment.RETAINER]: "time.treatment.retainer",
  [WorkEntryTreatment.AT]: "time.treatment.at",
  [WorkEntryTreatment.HOURLY]: "time.treatment.hourly",
  [WorkEntryTreatment.NON_BILLABLE]: "time.treatment.nonBillable",
  [WorkEntryTreatment.UNDECIDED]: "time.treatment.undecided",
};

/** Statuses a written-off entry can be saved with from the edit dialog. */
export const RESTORABLE_WORK_ENTRY_STATUSES = [
  WorkEntryStatus.WRITTEN_OFF,
  WorkEntryStatus.CONFIRMED,
] as const;
export type RestorableWorkEntryStatus =
  (typeof RESTORABLE_WORK_ENTRY_STATUSES)[number];

export const TIME_REVIEW_REASON_LABELS: LabelMap<TimeReviewReason> = {
  [TimeReviewReason.ACTIVITY]: "time.review.reason.activity",
  [TimeReviewReason.DOCUMENT]: "time.review.reason.document",
  [TimeReviewReason.CHAT]: "time.review.reason.chat",
};

export const WORK_ENTRY_DELETE_BLOCKED_LABELS: LabelMap<WorkEntryDeleteBlockedReason> =
  {
    [WorkEntryDeleteBlockedReason.LAST_TASK_ENTRY]:
      "work.entries.lastEntryInfo",
    [WorkEntryDeleteBlockedReason.BILLED]: "work.entries.billedInfo",
    [WorkEntryDeleteBlockedReason.NOT_ALLOWED]: "work.entries.deleteNotAllowed",
  };

export const PRICE_SUGGESTION_CONFIDENCE_LABELS: LabelMap<PriceSuggestionConfidence> =
  {
    [PriceSuggestionConfidence.LOW]: "time.capture.priceConfidence.LOW",
    [PriceSuggestionConfidence.MEDIUM]: "time.capture.priceConfidence.MEDIUM",
    [PriceSuggestionConfidence.HIGH]: "time.capture.priceConfidence.HIGH",
  };
