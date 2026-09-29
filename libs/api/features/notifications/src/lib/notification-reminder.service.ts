import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from "@nestjs/common";
import { NotificationType } from "@prisma/client";
import { PlatformPrismaService } from "@law/core";
import { buildNotificationContent } from "./notification-content";
import { NotificationsService } from "./notifications.service";

const FALLBACK_TIME_ZONE = "Europe/Belgrade";
const HOUR_MS = 60 * 60 * 1000;

function localDateKey(value: Date, timeZone: string): string {
  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: FALLBACK_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }
  const parts = formatter.formatToParts(value);
  const values = Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${values["year"]}-${values["month"]}-${values["day"]}`;
}

function dateOrdinal(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

export function reminderDayDifference(
  input: { dueDate?: Date | null; dueAt?: Date | null },
  now: Date,
  timeZone: string,
): number | null {
  const targetKey = input.dueAt
    ? localDateKey(input.dueAt, timeZone)
    : input.dueDate?.toISOString().slice(0, 10);
  if (!targetKey) return null;
  return dateOrdinal(targetKey) - dateOrdinal(localDateKey(now, timeZone));
}

function targetKey(input: {
  dueDate?: Date | null;
  dueAt?: Date | null;
  startsAt?: Date | null;
}): string {
  if (input.startsAt) return input.startsAt.toISOString();
  if (input.dueAt) return input.dueAt.toISOString();
  return input.dueDate?.toISOString().slice(0, 10) ?? "none";
}

@Injectable()
export class NotificationReminderService
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(NotificationReminderService.name);
  private interval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: PlatformPrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  onApplicationBootstrap(): void {
    this.interval = setInterval(() => {
      void this.run().catch((error: unknown) => {
        this.logger.error("Notification reminder run failed", error);
      });
    }, HOUR_MS);
    this.interval.unref?.();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
  }

  async run(now = new Date()): Promise<void> {
    await Promise.all([
      this.processTasks(now),
      this.processDeadlines(now),
      this.processEvents(now),
    ]);
  }

  private async processTasks(now: Date): Promise<void> {
    const tasks = await this.db.task.findMany({
      where: {
        status: { in: ["TODO", "IN_PROGRESS"] },
        OR: [{ dueAt: { not: null } }, { dueDate: { not: null } }],
      },
      include: {
        case: { select: { id: true, name: true } },
        client: { select: { id: true, displayName: true } },
        assignee: { select: { settings: { select: { timeZone: true } } } },
        workspace: { select: { config: { select: { timeZone: true } } } },
      },
    });
    await Promise.all(
      tasks.map(async (task) => {
        const timeZone =
          task.assignee.settings?.timeZone ??
          task.workspace.config?.timeZone ??
          FALLBACK_TIME_ZONE;
        const days = reminderDayDifference(task, now, timeZone);
        let type: NotificationType | null = null;
        let window = "";
        if (days === 1) {
          type = "TASK_DUE_SOON";
          window = "due-soon:1d";
        } else if (days === 0) {
          type = "TASK_DUE_TODAY";
          window = "due-today";
        } else if (days !== null && days < 0) {
          type = "TASK_OVERDUE";
          window = "overdue";
        }
        if (!type) return;
        const content = buildNotificationContent(type, {
          title: task.title,
          caseId: task.case?.id,
          caseName: task.case?.name,
          clientId: task.client?.id,
          clientName: task.client?.displayName,
          dueDate: task.dueDate?.toISOString().slice(0, 10),
          dueAt: task.dueAt?.toISOString(),
        });
        await this.notifications.create({
          workspaceId: task.workspaceId,
          userId: task.assigneeUserId,
          type,
          ...content,
          entityType: "TASK",
          entityId: task.id,
          dedupeKey: `task:${task.id}:${window}:${targetKey(task)}:${task.assigneeUserId}`,
        });
      }),
    );
  }

  private async processDeadlines(now: Date): Promise<void> {
    const deadlines = await this.db.deadline.findMany({
      where: { status: "OPEN" },
      include: {
        case: { select: { id: true, name: true } },
        client: { select: { id: true, displayName: true } },
        workspace: { select: { config: { select: { timeZone: true } } } },
      },
    });
    await Promise.all(
      deadlines.map(async (deadline) => {
        const timeZone =
          deadline.timeZone ??
          deadline.workspace.config?.timeZone ??
          FALLBACK_TIME_ZONE;
        const days = reminderDayDifference(deadline, now, timeZone);
        let type: NotificationType | null = null;
        let window = "";
        if (days === 7 || days === 3 || days === 1) {
          type = "DEADLINE_DUE_SOON";
          window = `due-soon:${days}d`;
        } else if (days === 0) {
          type = "DEADLINE_DUE_TODAY";
          window = "due-today";
        } else if (days !== null && days < 0) {
          type = "DEADLINE_OVERDUE";
          window = "overdue";
        }
        if (!type) return;
        const content = buildNotificationContent(type, {
          title: deadline.title,
          caseId: deadline.case?.id,
          caseName: deadline.case?.name,
          clientId: deadline.client?.id,
          clientName: deadline.client?.displayName,
          dueDate: deadline.dueDate?.toISOString().slice(0, 10),
          dueAt: deadline.dueAt?.toISOString(),
        });
        await this.notifications.create({
          workspaceId: deadline.workspaceId,
          userId: deadline.responsibleUserId,
          type,
          ...content,
          entityType: "DEADLINE",
          entityId: deadline.id,
          dedupeKey: `deadline:${deadline.id}:${window}:${targetKey(deadline)}:${deadline.responsibleUserId}`,
        });
      }),
    );
  }

  private async processEvents(now: Date): Promise<void> {
    const events = await this.db.event.findMany({
      where: { status: "SCHEDULED" },
      include: {
        case: { select: { id: true, name: true } },
        clients: {
          take: 1,
          include: { client: { select: { id: true, displayName: true } } },
        },
        assignees: { select: { userId: true } },
      },
    });
    await Promise.all(
      events.map(async (event) => {
        const days = reminderDayDifference(
          { dueAt: event.startsAt },
          now,
          event.timeZone || FALLBACK_TIME_ZONE,
        );
        if (days !== 1) return;
        const client = event.clients[0]?.client;
        const content = buildNotificationContent("EVENT_UPCOMING", {
          title: event.title,
          caseId: event.case?.id,
          caseName: event.case?.name,
          clientId: client?.id,
          clientName: client?.displayName,
          startsAt: event.startsAt.toISOString(),
        });
        const recipients = new Set([
          event.organizerUserId,
          ...event.assignees.map((assignee) => assignee.userId),
        ]);
        await Promise.all(
          [...recipients].map((userId) =>
            this.notifications.create({
              workspaceId: event.workspaceId,
              userId,
              type: "EVENT_UPCOMING",
              ...content,
              entityType: "EVENT",
              entityId: event.id,
              dedupeKey: `event:${event.id}:upcoming:1d:${targetKey({ startsAt: event.startsAt })}:${userId}`,
            }),
          ),
        );
      }),
    );
  }
}
