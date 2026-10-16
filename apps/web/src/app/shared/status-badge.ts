import {
  CasePriority,
  CaseStatus,
  ClientStatus,
  ContractIssueRisk,
  DeadlineStatus,
  EventStatus,
  InvoiceStatus,
  TaskStatus,
  WorkEntryStatus,
} from "@law/api-interfaces";

/** Shared semantic-token styling for compact domain status and priority badges. */
export const STATUS_BADGE_BASE_CLASSES =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-sm font-medium whitespace-nowrap";

const SUCCESS = "border-success/40 bg-success/10 text-success";
const WARNING = "border-warning/40 bg-warning/10 text-warning";
const INFO = "border-info/40 bg-info/10 text-info";
const DESTRUCTIVE = "border-destructive/40 bg-destructive/10 text-destructive";
const MUTED = "border-border bg-muted text-muted-foreground";

/** Statuses of several domains share one tone; anything unlisted is muted. */
const STATUS_TONES: Readonly<Record<string, string>> = {
  [CaseStatus.ACTIVE]: SUCCESS,
  [TaskStatus.DONE]: SUCCESS,
  [EventStatus.COMPLETED]: SUCCESS,
  [DeadlineStatus.SATISFIED]: SUCCESS,
  [WorkEntryStatus.CONFIRMED]: SUCCESS,
  [InvoiceStatus.SENT]: SUCCESS,
  [WorkEntryStatus.RUNNING]: INFO,
  [TaskStatus.IN_PROGRESS]: INFO,
  [WorkEntryStatus.BILLED]: INFO,
  [ClientStatus.PROSPECT]: INFO,
  [WorkEntryStatus.PROPOSED]: WARNING,
  [CaseStatus.ON_HOLD]: WARNING,
  [EventStatus.SCHEDULED]: WARNING,
  [EventStatus.CANCELLED]: DESTRUCTIVE,
  [InvoiceStatus.VOIDED]: DESTRUCTIVE,
  [WorkEntryStatus.WRITTEN_OFF]: DESTRUCTIVE,
};

const PRIORITY_TONES: Readonly<Record<CasePriority, string>> = {
  [CasePriority.LOW]: INFO,
  [CasePriority.NORMAL]: MUTED,
  [CasePriority.HIGH]: WARNING,
  [CasePriority.URGENT]: DESTRUCTIVE,
};

const RISK_TONES: Readonly<Record<ContractIssueRisk, string>> = {
  [ContractIssueRisk.HIGH]: DESTRUCTIVE,
  [ContractIssueRisk.MEDIUM]: WARNING,
  [ContractIssueRisk.LOW]: INFO,
};

function toneOf(
  tones: Readonly<Record<string, string>>,
  value: string,
): string {
  return tones[value] ?? MUTED;
}

export function statusBadgeClass(status: string): string {
  return toneOf(STATUS_TONES, status);
}

export function priorityBadgeClass(priority: string): string {
  return toneOf(PRIORITY_TONES, priority);
}

export function riskBadgeClass(risk: string): string {
  return toneOf(RISK_TONES, risk);
}
