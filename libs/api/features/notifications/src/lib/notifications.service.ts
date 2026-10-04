import { Injectable, NotFoundException } from "@nestjs/common";
import { Notification, NotificationType, Prisma } from "@prisma/client";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  NotificationDto,
  NotificationListResponse,
  NotificationMetadata,
  NotificationPreferences,
  NotificationUnreadCountResponse,
} from "@law/api-interfaces";
import {
  PlatformPrismaService,
  WorkspaceContextService,
  paginationMeta,
} from "@law/core";

type DbClient = PlatformPrismaService | Prisma.TransactionClient;

const preferenceByType: Record<
  NotificationType,
  keyof NotificationPreferences
> = {
  DEADLINE_ASSIGNED: "deadlineAssigned",
  DEADLINE_DUE_SOON: "deadlineDueSoon",
  DEADLINE_DUE_TODAY: "deadlineDueToday",
  DEADLINE_OVERDUE: "deadlineOverdue",
  DEADLINE_CHANGED: "deadlineChanged",
  TASK_ASSIGNED: "taskAssigned",
  TASK_DUE_SOON: "taskDueSoon",
  TASK_DUE_TODAY: "taskDueToday",
  TASK_OVERDUE: "taskOverdue",
  EVENT_UPCOMING: "eventUpcoming",
  EVENT_CHANGED: "eventChanged",
  EVENT_CANCELLED: "eventCancelled",
  TIMER_RUNNING_LONG: "timerRunningLong",
  TIME_REVIEW_REMINDER: "timeReviewReminder",
  RETAINER_USAGE_80: "retainerUsage",
  RETAINER_USAGE_100: "retainerUsage",
};

export interface CreateNotificationInput {
  workspaceId: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: "TASK" | "DEADLINE" | "EVENT";
  entityId?: string;
  metadata?: NotificationMetadata;
  dedupeKey?: string;
}

export type CreateNotificationResult =
  | { status: "created"; notification: Notification }
  | { status: "skipped"; reason: "disabled" | "inactive-user" | "duplicate" };

@Injectable()
export class NotificationsService {
  constructor(private readonly db: PlatformPrismaService) {}

  async create(
    input: CreateNotificationInput,
    client: DbClient = this.db,
  ): Promise<CreateNotificationResult> {
    const [workspace, membership, settings] = await Promise.all([
      client.workspace.findUnique({
        where: { id: input.workspaceId },
        select: { config: { select: { workspaceNotifications: true } } },
      }),
      client.workspaceMember.findUnique({
        where: {
          userId_workspaceId: {
            userId: input.userId,
            workspaceId: input.workspaceId,
          },
        },
        select: { status: true },
      }),
      client.userSettings.findUnique({
        where: { userId: input.userId },
        select: {
          workspaceNotifications: true,
          notificationPreferences: true,
        },
      }),
    ]);
    if (!workspace || !membership || membership.status !== "ACTIVE") {
      return { status: "skipped", reason: "inactive-user" };
    }
    if (
      workspace.config?.workspaceNotifications === false ||
      settings?.workspaceNotifications === false ||
      !this.isTypeEnabled(settings?.notificationPreferences, input.type)
    ) {
      return { status: "skipped", reason: "disabled" };
    }
    const data: Prisma.NotificationCreateManyInput = {
      workspaceId: input.workspaceId,
      userId: input.userId,
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata as Prisma.InputJsonValue | undefined,
      dedupeKey: input.dedupeKey,
    };
    try {
      if (input.dedupeKey) {
        const inserted = await client.notification.createMany({
          data,
          skipDuplicates: true,
        });
        if (inserted.count === 0) {
          return { status: "skipped", reason: "duplicate" };
        }
        const notification = await client.notification.findUniqueOrThrow({
          where: {
            workspaceId_userId_dedupeKey: {
              workspaceId: input.workspaceId,
              userId: input.userId,
              dedupeKey: input.dedupeKey,
            },
          },
        });
        return { status: "created", notification };
      }
      const notification = await client.notification.create({ data });
      return { status: "created", notification };
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        return { status: "skipped", reason: "duplicate" };
      }
      throw error;
    }
  }

  isTypeEnabled(value: unknown, type: NotificationType): boolean {
    if (!value || typeof value !== "object" || Array.isArray(value))
      return true;
    const key = preferenceByType[type];
    const configured = (value as Record<string, unknown>)[key];
    return typeof configured === "boolean"
      ? configured
      : DEFAULT_NOTIFICATION_PREFERENCES[key];
  }

  async list(page = 1, pageSize = 10): Promise<NotificationListResponse> {
    const { workspaceId, userId } = WorkspaceContextService.required;
    const where = { workspaceId, userId };
    const [total, items] = await this.db.$transaction([
      this.db.notification.count({ where }),
      this.db.notification.findMany({
        where,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    return {
      items: items.map((item) => this.toDto(item)),
      meta: paginationMeta(page, pageSize, total, [
        { field: "createdAt", direction: "desc" },
        { field: "id", direction: "desc" },
      ]),
    };
  }

  async unreadCount(): Promise<NotificationUnreadCountResponse> {
    const { workspaceId, userId } = WorkspaceContextService.required;
    return {
      count: await this.db.notification.count({
        where: { workspaceId, userId, isRead: false },
      }),
    };
  }

  async markRead(id: string): Promise<NotificationDto> {
    const { workspaceId, userId } = WorkspaceContextService.required;
    const existing = await this.db.notification.findFirst({
      where: { id, workspaceId, userId },
    });
    if (!existing) throw new NotFoundException("Notification not found");
    const item = existing.isRead
      ? existing
      : await this.db.notification.update({
          where: { id },
          data: { isRead: true, readAt: new Date() },
        });
    return this.toDto(item);
  }

  async markAllRead(): Promise<{ updated: number }> {
    const { workspaceId, userId } = WorkspaceContextService.required;
    const result = await this.db.notification.updateMany({
      where: { workspaceId, userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { updated: result.count };
  }

  private toDto(item: Notification): NotificationDto {
    return {
      id: item.id,
      type: item.type,
      title: item.title,
      message: item.message,
      entityType: item.entityType as NotificationDto["entityType"],
      entityId: item.entityId,
      metadata: item.metadata as NotificationMetadata | null,
      isRead: item.isRead,
      readAt: item.readAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    );
  }
}
