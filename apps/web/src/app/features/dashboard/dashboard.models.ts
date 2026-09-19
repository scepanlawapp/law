import {
  ActivityLogSummary,
  CalendarItem,
  CalendarSourceType,
  CaseSummary,
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

const UNFINISHED_STATUSES = new Set([
  "SCHEDULED",
  "TODO",
  "IN_PROGRESS",
  "OPEN",
]);

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
    caseId: item.caseId,
    clientId: item.clientId,
    overdue:
      UNFINISHED_STATUSES.has(item.status) &&
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

export function caseSummaryToPreviewRow(
  item: CaseSummary,
  clientName: string,
  responsibleUserName: string,
): CasePreviewRow {
  return {
    id: item.id,
    caseNumber: item.caseNumber,
    name: item.name,
    status: item.status,
    clientName,
    responsibleUserName,
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
    caseId: item.caseId,
    clientId: item.clientId,
    responsibleUserId: null,
    assigneeUserIds: [],
  };
}
