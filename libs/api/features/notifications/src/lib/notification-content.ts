import { NotificationType } from "@prisma/client";
import { NotificationMetadata } from "@law/api-interfaces";

export interface NotificationContentContext {
  title: string;
  caseId?: string | null;
  caseName?: string | null;
  clientId?: string | null;
  clientName?: string | null;
  dueDate?: string | null;
  dueAt?: string | null;
  startsAt?: string | null;
  oldDueDate?: string | null;
  newDueDate?: string | null;
  oldDueAt?: string | null;
  newDueAt?: string | null;
}

const titles: Record<NotificationType, string> = {
  DEADLINE_ASSIGNED: "Dodeljen vam je rok",
  DEADLINE_DUE_SOON: "Rok se približava",
  DEADLINE_DUE_TODAY: "Rok ističe danas",
  DEADLINE_OVERDUE: "Rok je prekoračen",
  DEADLINE_CHANGED: "Rok je izmenjen",
  TASK_ASSIGNED: "Dodeljen vam je zadatak",
  TASK_DUE_SOON: "Zadatak dospeva sutra",
  TASK_DUE_TODAY: "Zadatak dospeva danas",
  TASK_OVERDUE: "Zadatak kasni",
  EVENT_UPCOMING: "Predstojeći događaj",
  EVENT_CHANGED: "Događaj je izmenjen",
  EVENT_CANCELLED: "Događaj je otkazan",
  TIMER_RUNNING_LONG: "Tajmer je i dalje uključen",
  TIME_REVIEW_REMINDER: "Pregled današnjeg rada",
  RETAINER_USAGE_80: "Paušal je iskorišćen 80%",
  RETAINER_USAGE_100: "Paušal je u potpunosti iskorišćen",
};

export function buildNotificationContent(
  type: NotificationType,
  context: NotificationContentContext,
): { title: string; message: string; metadata: NotificationMetadata } {
  const metadata: NotificationMetadata = {
    ...(context.caseId ? { caseId: context.caseId } : {}),
    ...(context.caseName ? { caseName: context.caseName } : {}),
    ...(context.clientId ? { clientId: context.clientId } : {}),
    ...(context.clientName ? { clientName: context.clientName } : {}),
    ...(context.dueDate ? { dueDate: context.dueDate } : {}),
    ...(context.dueAt ? { dueAt: context.dueAt } : {}),
    ...(context.startsAt ? { startsAt: context.startsAt } : {}),
    ...(context.oldDueDate !== undefined
      ? { oldDueDate: context.oldDueDate }
      : {}),
    ...(context.newDueDate !== undefined
      ? { newDueDate: context.newDueDate }
      : {}),
    ...(context.oldDueAt !== undefined ? { oldDueAt: context.oldDueAt } : {}),
    ...(context.newDueAt !== undefined ? { newDueAt: context.newDueAt } : {}),
  };
  return { title: titles[type], message: context.title, metadata };
}
