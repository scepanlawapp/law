import {
  CalendarSourceType,
  NotificationType,
  type NotificationDto,
} from "@law/api-interfaces";

export interface NotificationTarget {
  commands: string[];
  queryParams?: Record<string, string>;
}

/** Where opening a notification should take the user, or `null` for nowhere. */
export function notificationTarget(
  item: NotificationDto,
): NotificationTarget | null {
  switch (item.type) {
    case NotificationType.TIME_REVIEW_REMINDER:
      return { commands: ["/work/time/review"] };
    case NotificationType.TIMER_RUNNING_LONG:
      return { commands: ["/work/time"] };
    case NotificationType.RETAINER_USAGE_80:
    case NotificationType.RETAINER_USAGE_100: {
      const clientId = item.metadata?.clientId;
      return { commands: clientId ? ["/clients", clientId] : ["/finance"] };
    }
  }
  if (item.entityType === CalendarSourceType.TASK) {
    return { commands: ["/work/my"], queryParams: { search: item.message } };
  }
  if (
    item.entityType === CalendarSourceType.DEADLINE ||
    item.entityType === CalendarSourceType.EVENT
  ) {
    const date =
      item.metadata?.dueDate ??
      item.metadata?.dueAt?.slice(0, 10) ??
      item.metadata?.startsAt?.slice(0, 10);
    return {
      commands: ["/calendar"],
      queryParams: { view: "list", ...(date ? { date } : {}) },
    };
  }
  return null;
}
