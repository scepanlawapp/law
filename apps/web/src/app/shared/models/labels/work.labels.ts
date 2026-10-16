import {
  CalendarSourceType,
  CasePriority,
  DeadlineStatus,
  DeadlineType,
  EventStatus,
  EventType,
  TaskStatus,
} from "@law/api-interfaces";
import { LabelMap } from "../select-option";
import { DueTargetMode } from "../types/work";

export const TASK_STATUS_LABELS: LabelMap<TaskStatus> = {
  [TaskStatus.TODO]: "work.taskStatus.todo",
  [TaskStatus.IN_PROGRESS]: "work.taskStatus.in_progress",
  [TaskStatus.DONE]: "work.taskStatus.done",
  [TaskStatus.CANCELLED]: "work.taskStatus.cancelled",
  [TaskStatus.ARCHIVED]: "work.taskStatus.archived",
};

/** Status wording of the Team work / My work filters and status selects. */
export const WORK_VIEW_STATUS_LABELS: LabelMap<TaskStatus> = {
  [TaskStatus.TODO]: "work.status.todo",
  [TaskStatus.IN_PROGRESS]: "work.status.inProgress",
  [TaskStatus.DONE]: "work.status.done",
  [TaskStatus.CANCELLED]: "work.status.cancelled",
  [TaskStatus.ARCHIVED]: "work.status.archived",
};

/** Statuses only the table presentation can show. */
export const TABLE_ONLY_WORK_VIEW_STATUSES: readonly TaskStatus[] = [
  TaskStatus.CANCELLED,
  TaskStatus.ARCHIVED,
];

export const WORK_BOARD_COLUMNS = [
  TaskStatus.TODO,
  TaskStatus.IN_PROGRESS,
  TaskStatus.DONE,
] as const;
export type WorkBoardColumn = (typeof WORK_BOARD_COLUMNS)[number];

export const WORK_BOARD_COLUMN_LABELS: LabelMap<WorkBoardColumn> = {
  [TaskStatus.TODO]: "work.board.todo",
  [TaskStatus.IN_PROGRESS]: "work.board.in_progress",
  [TaskStatus.DONE]: "work.board.done",
};

export const TASK_PRIORITY_LABELS: LabelMap<CasePriority> = {
  [CasePriority.LOW]: "work.priority.low",
  [CasePriority.NORMAL]: "work.priority.normal",
  [CasePriority.HIGH]: "work.priority.high",
  [CasePriority.URGENT]: "work.priority.urgent",
};

export const DUE_TARGET_MODE_LABELS: LabelMap<DueTargetMode> = {
  [DueTargetMode.NONE]: "work.dueMode.none",
  [DueTargetMode.DATE]: "work.dueMode.date",
  [DueTargetMode.DATE_TIME]: "work.dueMode.date_time",
};

/** A deadline always has a due date. */
export const DEADLINE_DUE_TARGET_MODES = [
  DueTargetMode.DATE,
  DueTargetMode.DATE_TIME,
] as const;
export type DeadlineDueTargetMode = (typeof DEADLINE_DUE_TARGET_MODES)[number];

export const DEADLINE_TYPE_LABELS: LabelMap<DeadlineType> = {
  [DeadlineType.COURT]: "work.deadlineType.court",
  [DeadlineType.STATUTORY]: "work.deadlineType.statutory",
  [DeadlineType.CONTRACTUAL]: "work.deadlineType.contractual",
  [DeadlineType.INTERNAL]: "work.deadlineType.internal",
  [DeadlineType.OTHER]: "work.deadlineType.other",
};

export const DEADLINE_STATUS_LABELS: LabelMap<DeadlineStatus> = {
  [DeadlineStatus.OPEN]: "work.deadlineStatus.open",
  [DeadlineStatus.SATISFIED]: "work.deadlineStatus.satisfied",
  [DeadlineStatus.CANCELLED]: "work.deadlineStatus.cancelled",
};

export const EVENT_TYPE_LABELS: LabelMap<EventType> = {
  [EventType.MEETING]: "calendar.type.meeting",
  [EventType.HEARING]: "calendar.type.hearing",
  [EventType.CALL]: "calendar.type.call",
  [EventType.OTHER]: "calendar.type.other",
};

export const EVENT_STATUS_LABELS: LabelMap<EventStatus> = {
  [EventStatus.SCHEDULED]: "calendar.status.scheduled",
  [EventStatus.COMPLETED]: "calendar.status.completed",
  [EventStatus.CANCELLED]: "calendar.status.cancelled",
};

export const CALENDAR_SOURCE_TYPE_LABELS: LabelMap<CalendarSourceType> = {
  [CalendarSourceType.EVENT]: "calendar.source.event",
  [CalendarSourceType.TASK]: "calendar.source.task",
  [CalendarSourceType.DEADLINE]: "calendar.source.deadline",
};

/** Record-type wording of compact obligation lists. */
export const WORK_RECORD_TYPE_LABELS: LabelMap<CalendarSourceType> = {
  [CalendarSourceType.TASK]: "work.recordType.task",
  [CalendarSourceType.DEADLINE]: "work.recordType.deadline",
  [CalendarSourceType.EVENT]: "work.recordType.event",
};

/** Status of any calendar item: an event, task or deadline status. */
export type CalendarItemStatus = EventStatus | TaskStatus | DeadlineStatus;

export const CALENDAR_ITEM_STATUS_LABELS: LabelMap<CalendarItemStatus> = {
  [EventStatus.SCHEDULED]: "calendar.status.scheduled",
  [EventStatus.COMPLETED]: "calendar.status.completed",
  [EventStatus.CANCELLED]: "calendar.status.cancelled",
  [TaskStatus.TODO]: "calendar.status.todo",
  [TaskStatus.IN_PROGRESS]: "calendar.status.in_progress",
  [TaskStatus.DONE]: "calendar.status.done",
  [TaskStatus.ARCHIVED]: "calendar.status.archived",
  [DeadlineStatus.OPEN]: "calendar.status.open",
  [DeadlineStatus.SATISFIED]: "calendar.status.satisfied",
};

/** Calendar items hidden unless "include closed" is on. */
export const CLOSED_CALENDAR_ITEM_STATUSES: readonly CalendarItemStatus[] = [
  EventStatus.COMPLETED,
  TaskStatus.DONE,
  EventStatus.CANCELLED,
  DeadlineStatus.SATISFIED,
];

/** Activity-log actions of work tracking; unknown actions use `work.activity.other`. */
export const WORK_ACTIVITY_ACTION_LABELS: Readonly<Record<string, string>> = {
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
