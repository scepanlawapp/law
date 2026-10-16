import {
  ActivityLogSummary,
  CalendarItem,
  CalendarSourceType,
  CaseSummary,
  DeadlineStatus,
  EventStatus,
  TaskStatus,
} from "@law/api-interfaces";
import { actionLabel } from "../work-management/work-management-utils";

/** Unified, dashboard-scoped preview of an upcoming Task/Deadline/Event. */
export interface ObligationItem {
  id: string;
  sourceType: CalendarSourceType;
  sourceId: string;
  title: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  date: string | null;
  caseId: string | null;
  clientId: string | null;
  overdue: boolean;
}

export interface ActivityFeedItem {
  id: string;
  labelKey: string;
  actorName: string | null;
  occurredAt: string;
  caseId: string | null;
  clientId: string | null;
}

export interface CasePreviewRow {
  id: string;
  caseNumber: string;
  name: string;
  status: CaseSummary["status"];
  clientName: string;
  responsibleUserName: string;
}

export const OPEN_TASK_STATUSES: TaskStatus[] = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
];

/** Event, task and deadline statuses that still need attention. */
export const UNFINISHED_STATUSES: string[] = [
  EventStatus.SCHEDULED,
  ...OPEN_TASK_STATUSES,
  DeadlineStatus.OPEN,
];

/** Calendar items are already deduplicated per record by the aggregation endpoint. */
export function calendarItemToObligation(item: CalendarItem): ObligationItem {
  const target = item.startsAt ?? item.date;
  return {
    id: item.calendarId,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    status: item.status,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    date: item.date,
    caseId: item.case?.id ?? null,
    clientId: item.client?.id ?? null,
    overdue:
      UNFINISHED_STATUSES.includes(item.status) &&
      !!target &&
      new Date(target).getTime() < Date.now(),
  };
}

export function activityLogToFeedItem(
  entry: ActivityLogSummary,
  actorName: string | null,
): ActivityFeedItem {
  return {
    id: entry.id,
    labelKey: actionLabel(entry),
    actorName,
    occurredAt: entry.occurredAt,
    caseId: entry.caseId,
    clientId: entry.clientId,
  };
}

export function caseSummaryToPreviewRow(item: CaseSummary): CasePreviewRow {
  return {
    id: item.id,
    caseNumber: item.caseNumber,
    name: item.name,
    status: item.status,
    clientName: item.client.displayName,
    responsibleUserName: item.responsibleUser.displayName,
  };
}

/** Reconstructs the CalendarItem shape the event dialog expects from our display model. */
export function obligationToCalendarItem(item: ObligationItem): CalendarItem {
  return {
    calendarId: item.id,
    sourceType: item.sourceType,
    sourceId: item.sourceId,
    title: item.title,
    status: item.status,
    startsAt: item.startsAt,
    endsAt: item.endsAt,
    date: item.date,
    timeZone: null,
    case: null,
    client: null,
    responsibleUser: null,
    assigneeUsers: [],
  };
}
