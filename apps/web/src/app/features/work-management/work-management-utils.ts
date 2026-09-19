import {
  ActivityLogSummary,
  DeadlineDetail,
  DeadlineStatus,
  NoteType,
  TaskDetail,
  TaskStatus,
} from "@law/api-interfaces";

export type DueTargetMode = "NONE" | "DATE" | "DATE_TIME";

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

export function taskDueMode(task?: TaskDetail | null): DueTargetMode {
  if (task?.dueAt) return "DATE_TIME";
  if (task?.dueDate) return "DATE";
  return "NONE";
}

export function deadlineDueMode(
  deadline?: DeadlineDetail | null,
): Exclude<DueTargetMode, "NONE"> {
  return deadline?.dueAt ? "DATE_TIME" : "DATE";
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
  if (["DONE", "CANCELLED"].includes(task.status)) return false;
  const value = task.dueAt ?? task.dueDate;
  if (!value) return false;
  const due = task.dueAt
    ? new Date(task.dueAt)
    : new Date(`${task.dueDate?.slice(0, 10)}T23:59:59`);
  return due.getTime() < Date.now();
}

export function isDeadlineOpen(status: DeadlineStatus): boolean {
  return status === "OPEN";
}

export function isTaskOpen(status: TaskStatus): boolean {
  return status === "TODO" || status === "IN_PROGRESS";
}

export function actionLabel(entry: ActivityLogSummary): string {
  const labels: Record<string, string> = {
    NOTE_CREATED: "work.activity.noteCreated",
    NOTE_UPDATED: "work.activity.noteUpdated",
    TASK_CREATED: "work.activity.taskCreated",
    TASK_UPDATED: "work.activity.taskUpdated",
    TASK_DONE: "work.activity.taskDone",
    TASK_TODO: "work.activity.taskReopened",
    TASK_CANCELLED: "work.activity.taskCancelled",
    DEADLINE_CREATED: "work.activity.deadlineCreated",
    DEADLINE_UPDATED: "work.activity.deadlineUpdated",
    DEADLINE_SATISFIED: "work.activity.deadlineSatisfied",
    DEADLINE_OPEN: "work.activity.deadlineReopened",
    DEADLINE_CANCELLED: "work.activity.deadlineCancelled",
    EVENT_CREATED: "work.activity.eventCreated",
    EVENT_UPDATED: "work.activity.eventUpdated",
    EVENT_COMPLETED: "work.activity.eventCompleted",
    EVENT_CANCELLED: "work.activity.eventCancelled",
  };
  return labels[entry.action] ?? "work.activity.other";
}

export function noteTypeLabel(type: NoteType): string {
  return `work.noteType.${type.toLowerCase()}`;
}

export function preview(body: string): string {
  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}
