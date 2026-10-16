import {
  ActivityLogSummary,
  DeadlineStatus,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";
import {
  DeadlineDueTargetMode,
  WORK_ACTIVITY_ACTION_LABELS,
} from "../../shared/models";
import { DueTargetMode } from "../../shared/models";

const CLOSED_TASK_STATUSES: readonly TaskStatus[] = [
  TaskStatus.DONE,
  TaskStatus.CANCELLED,
  TaskStatus.ARCHIVED,
];

export function todayDateInputValue(): string {
  const today = new Date();
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
}

export function dateInputValue(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

export function dateTimeInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function dueMode(
  dueDate: string | null | undefined,
  dueAt: string | null | undefined,
): DueTargetMode {
  if (dueAt) return DueTargetMode.DATE_TIME;
  if (dueDate) return DueTargetMode.DATE;
  return DueTargetMode.NONE;
}

export function taskDueMode(task?: TaskDetail | null): DueTargetMode {
  return dueMode(task?.dueDate, task?.dueAt);
}

export function deadlineDueMode(
  deadline?: { dueAt?: string | null } | null,
): DeadlineDueTargetMode {
  return deadline?.dueAt ? DueTargetMode.DATE_TIME : DueTargetMode.DATE;
}

export function dueLabel(
  dueDate: string | null,
  dueAt: string | null,
  emptyLabel: string,
  locale: string,
): string {
  if (dueAt) {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(dueAt));
  }
  if (dueDate) {
    return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
      new Date(`${dueDate.slice(0, 10)}T00:00:00`),
    );
  }
  return emptyLabel;
}

export function isTaskOverdue(task: TaskDetail): boolean {
  if (CLOSED_TASK_STATUSES.includes(task.status)) return false;
  const value = task.dueAt ?? task.dueDate;
  if (!value) return false;
  const due = task.dueAt
    ? new Date(task.dueAt)
    : new Date(`${task.dueDate?.slice(0, 10)}T23:59:59`);
  return due.getTime() < Date.now();
}

export function isDeadlineOpen(status: DeadlineStatus): boolean {
  return status === DeadlineStatus.OPEN;
}

export function isTaskOpen(status: TaskStatus): boolean {
  return status === TaskStatus.TODO || status === TaskStatus.IN_PROGRESS;
}

export function actionLabel(entry: ActivityLogSummary): string {
  return WORK_ACTIVITY_ACTION_LABELS[entry.action] ?? "work.activity.other";
}
