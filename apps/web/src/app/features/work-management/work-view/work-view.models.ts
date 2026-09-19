import {
  DeadlineDetail,
  DeadlineStatus,
  EventDetail,
  EventStatus,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import { isTaskOverdue } from "../work-management-utils";

export type WorkSourceType = "TASK" | "DEADLINE" | "EVENT";
export type PresentationStatus = "TODO" | "IN_PROGRESS" | "DONE" | "CANCELLED";
export type BoardColumnKey = PresentationStatus;

/** Unified view-model so Task/Deadline/Event can share list/board rendering. */
export interface WorkItem {
  id: string;
  sourceType: WorkSourceType;
  title: string;
  rawStatus: TaskStatus | DeadlineStatus | EventStatus;
  presentationStatus: PresentationStatus;
  dueDate: string | null;
  dueAt: string | null;
  ownerUserIds: string[];
  caseId: string | null;
  clientId: string | null;
  overdue: boolean;
  raw: TaskDetail | DeadlineDetail | EventDetail;
}

export function taskPresentationStatus(status: TaskStatus): PresentationStatus {
  return status;
}

export function deadlinePresentationStatus(
  status: DeadlineStatus,
): PresentationStatus {
  if (status === "OPEN") return "TODO";
  if (status === "SATISFIED") return "DONE";
  return "CANCELLED";
}

export function eventPresentationStatus(
  status: EventStatus,
): PresentationStatus {
  if (status === "SCHEDULED") return "TODO";
  if (status === "COMPLETED") return "DONE";
  return "CANCELLED";
}

export function taskToWorkItem(task: TaskDetail): WorkItem {
  return {
    id: task.id,
    sourceType: "TASK",
    title: task.title,
    rawStatus: task.status,
    presentationStatus: taskPresentationStatus(task.status),
    dueDate: task.dueDate,
    dueAt: task.dueAt,
    ownerUserIds: [task.assigneeUserId],
    caseId: task.caseId,
    clientId: task.clientId,
    overdue: isTaskOverdue(task),
    raw: task,
  };
}

export function deadlineToWorkItem(deadline: DeadlineDetail): WorkItem {
  return {
    id: deadline.id,
    sourceType: "DEADLINE",
    title: deadline.title,
    rawStatus: deadline.status,
    presentationStatus: deadlinePresentationStatus(deadline.status),
    dueDate: deadline.dueDate,
    dueAt: deadline.dueAt,
    ownerUserIds: [deadline.responsibleUserId],
    caseId: deadline.caseId,
    clientId: deadline.clientId,
    overdue: deadline.overdue,
    raw: deadline,
  };
}

export function eventToWorkItem(event: EventDetail): WorkItem {
  const overdue =
    event.status === "SCHEDULED" &&
    new Date(event.endsAt).getTime() < Date.now();
  return {
    id: event.id,
    sourceType: "EVENT",
    title: event.title,
    rawStatus: event.status,
    presentationStatus: eventPresentationStatus(event.status),
    dueDate: null,
    dueAt: event.startsAt,
    ownerUserIds: event.assigneeUserIds.length
      ? event.assigneeUserIds
      : [event.organizerUserId],
    caseId: event.caseId,
    clientId: null,
    overdue,
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

export type DragTransitionAction =
  | "task-set-todo"
  | "task-set-in-progress"
  | "task-complete"
  | "task-reopen"
  | "deadline-satisfy"
  | "deadline-reopen"
  | "event-complete";

export interface DragTransition {
  action: DragTransitionAction;
}

/**
 * Only returns a transition when the backend actually exposes it. Cancelling and
 * event-reopen are intentionally never returned since no drag target covers them.
 */
export function allowedDrop(
  item: WorkItem,
  target: BoardColumnKey,
): DragTransition | null {
  if (item.presentationStatus === target) return null;
  if (target === "CANCELLED") return null;
  if (item.presentationStatus === "CANCELLED") return null;

  if (item.sourceType === "TASK") {
    if (target === "IN_PROGRESS") {
      return item.presentationStatus === "TODO" ||
        item.presentationStatus === "DONE"
        ? { action: "task-set-in-progress" }
        : null;
    }
    if (target === "TODO") {
      if (item.presentationStatus === "IN_PROGRESS") {
        return { action: "task-set-todo" };
      }
      if (item.presentationStatus === "DONE") {
        return { action: "task-reopen" };
      }
      return null;
    }
    if (target === "DONE") {
      return { action: "task-complete" };
    }
    return null;
  }

  if (item.sourceType === "DEADLINE") {
    if (target === "IN_PROGRESS") return null;
    if (target === "DONE" && item.presentationStatus === "TODO") {
      return { action: "deadline-satisfy" };
    }
    if (target === "TODO" && item.presentationStatus === "DONE") {
      return { action: "deadline-reopen" };
    }
    return null;
  }

  // EVENT
  if (target === "IN_PROGRESS") return null;
  if (target === "DONE" && item.presentationStatus === "TODO") {
    return { action: "event-complete" };
  }
  return null;
}
