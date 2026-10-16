import {
  CalendarSourceType,
  CasePriority,
  DeadlineDetail,
  DeadlineStatus,
  EventDetail,
  EventStatus,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import { isTaskOverdue } from "../work-management-utils";

export const WorkViewMode = {
  TEAM: "team",
  MY: "my",
  CASE: "case",
} as const;
export type WorkViewMode = (typeof WorkViewMode)[keyof typeof WorkViewMode];

export const WorkPresentation = {
  TABLE: "table",
  BOARD: "board",
} as const;
export type WorkPresentation =
  (typeof WorkPresentation)[keyof typeof WorkPresentation];

/** Unified view-model so Task/Deadline/Event can share list/board rendering. */
export interface WorkItem {
  id: string;
  sourceType: CalendarSourceType;
  title: string;
  rawStatus: TaskStatus | DeadlineStatus | EventStatus;
  presentationStatus: TaskStatus;
  dueDate: string | null;
  dueAt: string | null;
  ownerUserIds: string[];
  caseId: string | null;
  clientId: string | null;
  overdue: boolean;
  priority: CasePriority | null;
  raw: TaskDetail | DeadlineDetail | EventDetail;
}

export function taskPresentationStatus(status: TaskStatus): TaskStatus {
  return status;
}

export function deadlinePresentationStatus(status: DeadlineStatus): TaskStatus {
  if (status === DeadlineStatus.OPEN) return TaskStatus.TODO;
  if (status === DeadlineStatus.SATISFIED) return TaskStatus.DONE;
  return TaskStatus.CANCELLED;
}

export function eventPresentationStatus(status: EventStatus): TaskStatus {
  if (status === EventStatus.SCHEDULED) return TaskStatus.TODO;
  if (status === EventStatus.COMPLETED) return TaskStatus.DONE;
  return TaskStatus.CANCELLED;
}

export function taskToWorkItem(task: TaskDetail): WorkItem {
  return {
    id: task.id,
    sourceType: CalendarSourceType.TASK,
    title: task.title,
    rawStatus: task.status,
    presentationStatus: taskPresentationStatus(task.status),
    dueDate: task.dueDate,
    dueAt: task.dueAt,
    ownerUserIds: [task.assigneeUser.id],
    caseId: task.case?.id ?? null,
    clientId: task.client?.id ?? null,
    overdue: isTaskOverdue(task),
    priority: task.priority,
    raw: task,
  };
}

export function deadlineToWorkItem(deadline: DeadlineDetail): WorkItem {
  return {
    id: deadline.id,
    sourceType: CalendarSourceType.DEADLINE,
    title: deadline.title,
    rawStatus: deadline.status,
    presentationStatus: deadlinePresentationStatus(deadline.status),
    dueDate: deadline.dueDate,
    dueAt: deadline.dueAt,
    ownerUserIds: [deadline.responsibleUser.id],
    caseId: deadline.case?.id ?? null,
    clientId: deadline.client?.id ?? null,
    overdue: deadline.overdue,
    priority: null,
    raw: deadline,
  };
}

export function eventToWorkItem(event: EventDetail): WorkItem {
  const overdue =
    event.status === EventStatus.SCHEDULED &&
    new Date(event.endsAt).getTime() < Date.now();
  return {
    id: event.id,
    sourceType: CalendarSourceType.EVENT,
    title: event.title,
    rawStatus: event.status,
    presentationStatus: eventPresentationStatus(event.status),
    dueDate: null,
    dueAt: event.startsAt,
    ownerUserIds: event.assigneeUsers.length
      ? event.assigneeUsers.map((user) => user.id)
      : [event.organizerUser.id],
    caseId: event.case?.id ?? null,
    clientId: event.clients[0]?.id ?? null,
    overdue,
    priority: null,
    raw: event,
  };
}

export function dueTimestamp(item: WorkItem): number {
  const value = item.dueAt ?? item.dueDate;
  return value ? new Date(value).getTime() : Number.POSITIVE_INFINITY;
}

export function sortWorkItems(items: WorkItem[]): WorkItem[] {
  return [...items].sort((a, b) => dueTimestamp(a) - dueTimestamp(b));
}

/** Append a page of results without dropping or duplicating already-loaded rows. */
export function mergePage<T extends { id: string }>(
  existing: T[],
  incoming: T[],
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export const StatusTransitionAction = {
  TASK_SET_TODO: "task-set-todo",
  TASK_SET_IN_PROGRESS: "task-set-in-progress",
  TASK_COMPLETE: "task-complete",
  TASK_REOPEN: "task-reopen",
  DEADLINE_SATISFY: "deadline-satisfy",
  DEADLINE_REOPEN: "deadline-reopen",
  EVENT_COMPLETE: "event-complete",
} as const;
export type StatusTransitionAction =
  (typeof StatusTransitionAction)[keyof typeof StatusTransitionAction];

export interface StatusTransition {
  action: StatusTransitionAction;
}

const TERMINAL_STATUSES: readonly TaskStatus[] = [
  TaskStatus.CANCELLED,
  TaskStatus.ARCHIVED,
];

export function statusTransition(
  item: WorkItem,
  target: TaskStatus,
): StatusTransition | null {
  const current = item.presentationStatus;
  if (current === target) return null;
  if (TERMINAL_STATUSES.includes(target)) return null;
  if (TERMINAL_STATUSES.includes(current)) return null;

  if (item.sourceType === CalendarSourceType.TASK) {
    if (target === TaskStatus.IN_PROGRESS) {
      return current === TaskStatus.TODO || current === TaskStatus.DONE
        ? { action: StatusTransitionAction.TASK_SET_IN_PROGRESS }
        : null;
    }
    if (target === TaskStatus.TODO) {
      if (current === TaskStatus.IN_PROGRESS) {
        return { action: StatusTransitionAction.TASK_SET_TODO };
      }
      if (current === TaskStatus.DONE) {
        return { action: StatusTransitionAction.TASK_REOPEN };
      }
      return null;
    }
    if (target === TaskStatus.DONE) {
      return { action: StatusTransitionAction.TASK_COMPLETE };
    }
    return null;
  }

  if (item.sourceType === CalendarSourceType.DEADLINE) {
    if (target === TaskStatus.IN_PROGRESS) return null;
    if (target === TaskStatus.DONE && current === TaskStatus.TODO) {
      return { action: StatusTransitionAction.DEADLINE_SATISFY };
    }
    if (target === TaskStatus.TODO && current === TaskStatus.DONE) {
      return { action: StatusTransitionAction.DEADLINE_REOPEN };
    }
    return null;
  }

  if (target === TaskStatus.IN_PROGRESS) return null;
  if (target === TaskStatus.DONE && current === TaskStatus.TODO) {
    return { action: StatusTransitionAction.EVENT_COMPLETE };
  }
  return null;
}
