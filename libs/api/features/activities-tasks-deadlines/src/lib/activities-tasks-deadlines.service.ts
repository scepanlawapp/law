import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ActivityLogSummary,
  CalendarItem,
  CalendarResponse,
  DeadlineDetail,
  EventDetail,
  NoteDetail,
  PaginatedResponse,
  TaskDetail,
} from "@law/api-interfaces";
import {
  PlatformPrismaService,
  WorkspaceContextService,
  paginationMeta,
  parseSort,
} from "@law/core";
import {
  ActivityListQueryDto,
  CalendarQueryDto,
  CreateDeadlineDto,
  CreateEventDto,
  CreateNoteDto,
  CreateTaskDto,
  DeadlineListQueryDto,
  EventListQueryDto,
  NoteListQueryDto,
  TaskListQueryDto,
  TransitionDto,
  UpdateDeadlineDto,
  UpdateEventDto,
  UpdateNoteDto,
  UpdateTaskDto,
} from "./activities-tasks-deadlines.dto";

// CalendarQueryDto.statuses is one combined string[] filter shared across Event/Task/Deadline;
// each record type only accepts its own enum, so requested values must be narrowed per type.
const EVENT_STATUSES = ["SCHEDULED", "COMPLETED", "CANCELLED"] as const;
const TASK_STATUSES = ["TODO", "IN_PROGRESS", "DONE", "CANCELLED"] as const;
const DEADLINE_STATUSES = ["OPEN", "SATISFIED", "CANCELLED"] as const;

function narrowStatuses<T extends string>(
  statuses: string[] | undefined,
  allowed: readonly T[],
): T[] | undefined {
  if (!statuses) return undefined;
  return statuses.filter((status): status is T =>
    (allowed as readonly string[]).includes(status),
  );
}

@Injectable()
export class ActivitiesTasksDeadlinesService {
  constructor(private readonly db: PlatformPrismaService) {}

  private get context() {
    return WorkspaceContextService.required;
  }

  private async validateContext(input: {
    caseId?: string;
    clientId?: string;
    clientIds?: string[];
    userIds?: string[];
    clientContactIds?: string[];
    deadlineId?: string;
    eventId?: string;
  }): Promise<void> {
    const { workspaceId } = this.context;
    if (input.caseId) {
      const item = await this.db.case.findFirst({
        where: { id: input.caseId, workspaceId },
      });
      if (!item) throw new BadRequestException("Case is unavailable");
      if (input.clientId && item.clientId !== input.clientId) {
        throw new BadRequestException("Client is not related to the case");
      }
    }
    if (input.clientId) {
      const item = await this.db.client.findFirst({
        where: { id: input.clientId, workspaceId },
      });
      if (!item) throw new BadRequestException("Client is unavailable");
    }
    if (input.clientIds?.length) {
      const count = await this.db.client.count({
        where: { id: { in: input.clientIds }, workspaceId },
      });
      if (count !== new Set(input.clientIds).size)
        throw new BadRequestException("Client is unavailable");
    }
    if (input.clientContactIds?.length) {
      const count = await this.db.clientContact.count({
        where: {
          id: { in: input.clientContactIds },
          client: { workspaceId },
        },
      });
      if (count !== new Set(input.clientContactIds).size) {
        throw new BadRequestException("Client contact is unavailable");
      }
    }
    if (input.userIds?.length) {
      const count = await this.db.workspaceMember.count({
        where: { workspaceId, userId: { in: input.userIds }, status: "ACTIVE" },
      });
      if (count !== new Set(input.userIds).size)
        throw new BadRequestException("User is not an active workspace member");
    }
    if (input.deadlineId) {
      const item = await this.db.deadline.findFirst({
        where: { id: input.deadlineId, workspaceId },
      });
      if (!item) throw new BadRequestException("Deadline is unavailable");
      if (input.caseId && item.caseId && item.caseId !== input.caseId)
        throw new BadRequestException("Task and deadline cases do not match");
      if (input.clientId && item.clientId && item.clientId !== input.clientId)
        throw new BadRequestException("Task and deadline clients do not match");
    }
    if (input.eventId) {
      const item = await this.db.event.findFirst({
        where: { id: input.eventId, workspaceId },
      });
      if (!item) throw new BadRequestException("Event is unavailable");
      if (input.caseId && item.caseId && item.caseId !== input.caseId)
        throw new BadRequestException("Note and event cases do not match");
    }
  }

  private checkRange(startsAt: string, endsAt: string): void {
    if (new Date(endsAt).getTime() <= new Date(startsAt).getTime())
      throw new BadRequestException("Event must end after it starts");
  }

  private dueTarget(dueDate?: string, dueAt?: string, required = false): void {
    if (dueDate && dueAt)
      throw new BadRequestException(
        "dueDate and dueAt cannot both be provided",
      );
    if (required && !dueDate && !dueAt)
      throw new BadRequestException("Exactly one due target is required");
  }

  private async log(
    tx: Prisma.TransactionClient,
    input: {
      action: string;
      entityType: string;
      entityId: string;
      caseId?: string | null;
      clientId?: string | null;
      metadata?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.activityLog.create({
      data: {
        workspaceId: this.context.workspaceId,
        actorUserId: this.context.userId,
        ...input,
      },
    });
  }

  private event(item: any): EventDetail {
    return {
      ...item,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      clientIds: item.clients?.map((x: any) => x.clientId) ?? [],
      assigneeUserIds: item.assignees?.map((x: any) => x.userId) ?? [],
      attendees:
        item.attendees?.map((x: any) => ({
          id: x.id,
          clientContactId: x.clientContactId,
          displayName: x.displayName,
          email: x.email,
        })) ?? [],
    };
  }

  private task(item: any): TaskDetail {
    return {
      ...item,
      dueDate: item.dueDate ? item.dueDate.toISOString().slice(0, 10) : null,
      dueAt: item.dueAt?.toISOString() ?? null,
      completedAt: item.completedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private deadline(item: any): DeadlineDetail {
    const target = item.dueAt ?? item.dueDate;
    return {
      ...item,
      dueDate: item.dueDate ? item.dueDate.toISOString().slice(0, 10) : null,
      dueAt: item.dueAt?.toISOString() ?? null,
      satisfiedAt: item.satisfiedAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      overdue:
        item.status === "OPEN" && !!target && target.getTime() < Date.now(),
    };
  }

  private note(item: any): NoteDetail {
    return {
      ...item,
      occurredAt: item.occurredAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  async listEvents(
    query: EventListQueryDto,
  ): Promise<PaginatedResponse<EventDetail>> {
    const { workspaceId } = this.context;
    const userIds = query.userIds ?? (query.userId ? [query.userId] : []);
    const conditions: Prisma.EventWhereInput[] = [{ workspaceId }];
    if (query.type) conditions.push({ type: query.type });
    if (query.statuses?.length)
      conditions.push({ status: { in: query.statuses } });
    else if (query.status) conditions.push({ status: query.status });
    if (query.caseId) conditions.push({ caseId: query.caseId });
    if (query.clientId)
      conditions.push({ clients: { some: { clientId: query.clientId } } });
    if (userIds.length)
      conditions.push({
        OR: [
          { organizerUserId: { in: userIds } },
          { assignees: { some: { userId: { in: userIds } } } },
        ],
      });
    if (query.search?.trim())
      conditions.push({
        OR: [
          { title: { contains: query.search.trim(), mode: "insensitive" } },
          {
            description: {
              contains: query.search.trim(),
              mode: "insensitive",
            },
          },
        ],
      });
    if (query.from)
      conditions.push({ startsAt: { gte: new Date(query.from) } });
    if (query.to) conditions.push({ startsAt: { lt: new Date(query.to) } });
    const where: Prisma.EventWhereInput = { AND: conditions };
    const [total, items] = await this.db.$transaction([
      this.db.event.count({ where }),
      this.db.event.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { startsAt: "asc" },
        include: { clients: true, assignees: true, attendees: true },
      }),
    ]);
    return {
      items: items.map((x) => this.event(x)),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        total,
        parseSort(
          undefined,
          ["startsAt"],
          [{ field: "startsAt", direction: "asc" }],
        ),
      ),
    };
  }

  async getEvent(id: string): Promise<EventDetail> {
    const item = await this.db.event.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
      include: { clients: true, assignees: true, attendees: true },
    });
    if (!item) throw new NotFoundException("Event not found");
    return this.event(item);
  }

  async createEvent(input: CreateEventDto): Promise<EventDetail> {
    this.checkRange(input.startsAt, input.endsAt);
    await this.validateContext({
      caseId: input.caseId,
      clientIds: input.clientIds,
      clientContactIds: input.attendees
        ?.map((attendee) => attendee.clientContactId)
        .filter((id): id is string => Boolean(id)),
      userIds: [this.context.userId, ...(input.assigneeUserIds ?? [])],
    });
    const item = await this.db.$transaction(async (tx) => {
      const event = await tx.event.create({
        data: {
          workspaceId: this.context.workspaceId,
          type: input.type,
          title: input.title.trim(),
          description: input.description?.trim(),
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          timeZone: input.timeZone,
          isAllDay: input.isAllDay ?? false,
          location: input.location?.trim(),
          meetingUrl: input.meetingUrl?.trim(),
          courtName: input.courtName?.trim(),
          courtroom: input.courtroom?.trim(),
          organizerUserId: this.context.userId,
          createdByUserId: this.context.userId,
          caseId: input.caseId,
          assignees: {
            create: (input.assigneeUserIds ?? []).map((userId) => ({
              userId,
              workspaceId: this.context.workspaceId,
            })),
          },
          clients: {
            create: (input.clientIds ?? []).map((clientId) => ({
              clientId,
              workspaceId: this.context.workspaceId,
            })),
          },
          attendees: {
            create: (input.attendees ?? []).map((x) => ({
              ...x,
              workspaceId: this.context.workspaceId,
            })),
          },
        },
        include: { clients: true, assignees: true, attendees: true },
      });
      await this.log(tx, {
        action: "EVENT_CREATED",
        entityType: "Event",
        entityId: event.id,
        caseId: event.caseId,
      });
      return event;
    });
    return this.event(item);
  }

  async updateEvent(id: string, input: UpdateEventDto): Promise<EventDetail> {
    this.checkRange(input.startsAt, input.endsAt);
    await this.validateContext({
      caseId: input.caseId,
      clientIds: input.clientIds,
      clientContactIds: input.attendees
        ?.map((attendee) => attendee.clientContactId)
        .filter((id): id is string => Boolean(id)),
      userIds: [this.context.userId, ...(input.assigneeUserIds ?? [])],
    });
    const item = await this.db.$transaction(async (tx) => {
      await tx.event.findFirstOrThrow({
        where: { id, workspaceId: this.context.workspaceId },
      });
      const event = await tx.event.update({
        where: { id },
        data: {
          type: input.type,
          title: input.title.trim(),
          description: input.description?.trim(),
          startsAt: new Date(input.startsAt),
          endsAt: new Date(input.endsAt),
          timeZone: input.timeZone,
          isAllDay: input.isAllDay ?? false,
          location: input.location?.trim(),
          meetingUrl: input.meetingUrl?.trim(),
          courtName: input.courtName?.trim(),
          courtroom: input.courtroom?.trim(),
          caseId: input.caseId,
          assignees: {
            deleteMany: {},
            create: (input.assigneeUserIds ?? []).map((userId) => ({
              userId,
              workspaceId: this.context.workspaceId,
            })),
          },
          clients: {
            deleteMany: {},
            create: (input.clientIds ?? []).map((clientId) => ({
              clientId,
              workspaceId: this.context.workspaceId,
            })),
          },
          attendees: {
            deleteMany: {},
            create: (input.attendees ?? []).map((x) => ({
              ...x,
              workspaceId: this.context.workspaceId,
            })),
          },
        },
        include: { clients: true, assignees: true, attendees: true },
      });
      await this.log(tx, {
        action: "EVENT_UPDATED",
        entityType: "Event",
        entityId: id,
        caseId: event.caseId,
      });
      return event;
    });
    return this.event(item);
  }

  async transitionEvent(
    id: string,
    target: "COMPLETED" | "CANCELLED",
  ): Promise<EventDetail> {
    const item = await this.db.$transaction(async (tx) => {
      const event = await tx.event.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!event) throw new NotFoundException("Event not found");
      if (
        (target === "COMPLETED" && event.status !== "SCHEDULED") ||
        (target === "CANCELLED" && event.status === "COMPLETED")
      )
        throw new BadRequestException("Invalid event status transition");
      const updated = await tx.event.update({
        where: { id },
        data: { status: target },
      });
      await this.log(tx, {
        action: `EVENT_${target}`,
        entityType: "Event",
        entityId: id,
        caseId: event.caseId,
      });
      return updated;
    });
    return this.getEvent(item.id);
  }

  async listTasks(
    query: TaskListQueryDto,
  ): Promise<PaginatedResponse<TaskDetail>> {
    const { workspaceId } = this.context;
    const assigneeUserIds =
      query.assigneeUserIds ??
      (query.assigneeUserId ? [query.assigneeUserId] : []);
    const conditions: Prisma.TaskWhereInput[] = [{ workspaceId }];
    if (query.statuses?.length)
      conditions.push({ status: { in: query.statuses } });
    else if (query.status) conditions.push({ status: query.status });
    if (query.priority) conditions.push({ priority: query.priority });
    if (assigneeUserIds.length)
      conditions.push({ assigneeUserId: { in: assigneeUserIds } });
    if (query.caseId) conditions.push({ caseId: query.caseId });
    if (query.clientId) conditions.push({ clientId: query.clientId });
    if (query.deadlineId) conditions.push({ deadlineId: query.deadlineId });
    if (query.search?.trim())
      conditions.push({
        OR: [
          { title: { contains: query.search.trim(), mode: "insensitive" } },
          {
            description: {
              contains: query.search.trim(),
              mode: "insensitive",
            },
          },
        ],
      });
    if (query.from || query.to) {
      const range: Prisma.DateTimeFilter = {};
      if (query.from) range.gte = new Date(query.from);
      if (query.to) range.lt = new Date(query.to);
      conditions.push({ OR: [{ dueDate: range }, { dueAt: range }] });
    }
    const where: Prisma.TaskWhereInput = { AND: conditions };
    const [total, items] = await this.db.$transaction([
      this.db.task.count({ where }),
      this.db.task.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }],
      }),
    ]);
    return {
      items: items.map((x) => this.task(x)),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        total,
        parseSort(
          undefined,
          ["dueDate"],
          [{ field: "dueDate", direction: "asc" }],
        ),
      ),
    };
  }
  async getTask(id: string): Promise<TaskDetail> {
    const item = await this.db.task.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Task not found");
    return this.task(item);
  }
  async createTask(input: CreateTaskDto): Promise<TaskDetail> {
    this.dueTarget(input.dueDate, input.dueAt);
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      deadlineId: input.deadlineId,
      userIds: [input.assigneeUserId],
    });
    const item = await this.db.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: this.context.workspaceId,
          title: input.title.trim(),
          description: input.description?.trim(),
          status: input.status ?? "TODO",
          priority: input.priority ?? "NORMAL",
          assigneeUserId: input.assigneeUserId,
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00.000Z`)
            : undefined,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          caseId: input.caseId,
          clientId: input.clientId,
          deadlineId: input.deadlineId,
          createdByUserId: this.context.userId,
        },
      });
      await this.log(tx, {
        action: "TASK_CREATED",
        entityType: "Task",
        entityId: task.id,
        caseId: task.caseId,
        clientId: task.clientId,
      });
      return task;
    });
    return this.task(item);
  }
  async updateTask(id: string, input: UpdateTaskDto): Promise<TaskDetail> {
    this.dueTarget(input.dueDate, input.dueAt);
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      deadlineId: input.deadlineId,
      userIds: [input.assigneeUserId],
    });
    const item = await this.db.$transaction(async (tx) => {
      const existing = await tx.task.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!existing) throw new NotFoundException("Task not found");
      const task = await tx.task.update({
        where: { id },
        data: {
          title: input.title.trim(),
          description: input.description?.trim(),
          status: input.status,
          priority: input.priority,
          assigneeUserId: input.assigneeUserId,
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00.000Z`)
            : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          caseId: input.caseId,
          clientId: input.clientId,
          deadlineId: input.deadlineId,
        },
      });
      await this.log(tx, {
        action: "TASK_UPDATED",
        entityType: "Task",
        entityId: id,
        caseId: task.caseId,
        clientId: task.clientId,
      });
      return task;
    });
    return this.task(item);
  }
  async transitionTask(
    id: string,
    target: "DONE" | "CANCELLED" | "TODO",
  ): Promise<TaskDetail> {
    const item = await this.db.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!task) throw new NotFoundException("Task not found");
      const done = target === "DONE";
      const updated = await tx.task.update({
        where: { id },
        data: {
          status: target,
          completedAt: done ? new Date() : null,
          completedByUserId: done ? this.context.userId : null,
        },
      });
      await this.log(tx, {
        action: `TASK_${target}`,
        entityType: "Task",
        entityId: id,
        caseId: task.caseId,
        clientId: task.clientId,
      });
      return updated;
    });
    return this.task(item);
  }

  async listDeadlines(
    query: DeadlineListQueryDto,
  ): Promise<PaginatedResponse<DeadlineDetail>> {
    const { workspaceId } = this.context;
    const responsibleUserIds =
      query.responsibleUserIds ??
      (query.responsibleUserId ? [query.responsibleUserId] : []);
    const conditions: Prisma.DeadlineWhereInput[] = [{ workspaceId }];
    if (query.statuses?.length)
      conditions.push({ status: { in: query.statuses } });
    else if (query.status) conditions.push({ status: query.status });
    if (query.type) conditions.push({ type: query.type });
    if (responsibleUserIds.length)
      conditions.push({ responsibleUserId: { in: responsibleUserIds } });
    if (query.caseId) conditions.push({ caseId: query.caseId });
    if (query.clientId) conditions.push({ clientId: query.clientId });
    if (query.search?.trim())
      conditions.push({
        OR: [
          { title: { contains: query.search.trim(), mode: "insensitive" } },
          {
            description: {
              contains: query.search.trim(),
              mode: "insensitive",
            },
          },
        ],
      });
    if (query.from || query.to) {
      const range: Prisma.DateTimeFilter = {};
      if (query.from) range.gte = new Date(query.from);
      if (query.to) range.lt = new Date(query.to);
      conditions.push({ OR: [{ dueDate: range }, { dueAt: range }] });
    }
    const where: Prisma.DeadlineWhereInput = { AND: conditions };
    const [total, items] = await this.db.$transaction([
      this.db.deadline.count({ where }),
      this.db.deadline.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: [{ dueDate: "asc" }, { dueAt: "asc" }],
      }),
    ]);
    return {
      items: items.map((x) => this.deadline(x)),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        total,
        parseSort(
          undefined,
          ["dueDate"],
          [{ field: "dueDate", direction: "asc" }],
        ),
      ),
    };
  }
  async getDeadline(id: string): Promise<DeadlineDetail> {
    const item = await this.db.deadline.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Deadline not found");
    return this.deadline(item);
  }
  async createDeadline(input: CreateDeadlineDto): Promise<DeadlineDetail> {
    this.dueTarget(input.dueDate, input.dueAt, true);
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      userIds: [input.responsibleUserId],
    });
    const item = await this.db.$transaction(async (tx) => {
      const deadline = await tx.deadline.create({
        data: {
          workspaceId: this.context.workspaceId,
          title: input.title.trim(),
          description: input.description?.trim(),
          type: input.type,
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00.000Z`)
            : undefined,
          dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
          timeZone: input.timeZone,
          responsibleUserId: input.responsibleUserId,
          caseId: input.caseId,
          clientId: input.clientId,
          sourceDescription: input.sourceDescription?.trim(),
          createdByUserId: this.context.userId,
        },
      });
      await this.log(tx, {
        action: "DEADLINE_CREATED",
        entityType: "Deadline",
        entityId: deadline.id,
        caseId: deadline.caseId,
        clientId: deadline.clientId,
      });
      return deadline;
    });
    return this.deadline(item);
  }
  async updateDeadline(
    id: string,
    input: UpdateDeadlineDto,
  ): Promise<DeadlineDetail> {
    this.dueTarget(input.dueDate, input.dueAt, true);
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      userIds: [input.responsibleUserId],
    });
    const item = await this.db.$transaction(async (tx) => {
      const existing = await tx.deadline.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!existing) throw new NotFoundException("Deadline not found");
      const deadline = await tx.deadline.update({
        where: { id },
        data: {
          title: input.title.trim(),
          description: input.description?.trim(),
          type: input.type,
          dueDate: input.dueDate
            ? new Date(`${input.dueDate}T00:00:00.000Z`)
            : null,
          dueAt: input.dueAt ? new Date(input.dueAt) : null,
          timeZone: input.timeZone,
          responsibleUserId: input.responsibleUserId,
          caseId: input.caseId,
          clientId: input.clientId,
          sourceDescription: input.sourceDescription?.trim(),
        },
      });
      await this.log(tx, {
        action: "DEADLINE_UPDATED",
        entityType: "Deadline",
        entityId: id,
        caseId: deadline.caseId,
        clientId: deadline.clientId,
      });
      return deadline;
    });
    return this.deadline(item);
  }
  async transitionDeadline(
    id: string,
    target: "SATISFIED" | "CANCELLED" | "OPEN",
  ): Promise<DeadlineDetail> {
    const item = await this.db.$transaction(async (tx) => {
      const deadline = await tx.deadline.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!deadline) throw new NotFoundException("Deadline not found");
      const updated = await tx.deadline.update({
        where: { id },
        data: {
          status: target,
          satisfiedAt: target === "SATISFIED" ? new Date() : null,
          satisfiedByUserId:
            target === "SATISFIED" ? this.context.userId : null,
        },
      });
      await this.log(tx, {
        action: `DEADLINE_${target}`,
        entityType: "Deadline",
        entityId: id,
        caseId: deadline.caseId,
        clientId: deadline.clientId,
      });
      return updated;
    });
    return this.deadline(item);
  }

  async listNotes(
    query: NoteListQueryDto,
  ): Promise<PaginatedResponse<NoteDetail>> {
    const { workspaceId } = this.context;
    const where: Prisma.NoteWhereInput = {
      workspaceId,
      ...(query.type && { type: query.type }),
      ...(query.caseId && { caseId: query.caseId }),
      ...(query.clientId && { clientId: query.clientId }),
      ...(query.eventId && { eventId: query.eventId }),
    };
    const [total, items] = await this.db.$transaction([
      this.db.note.count({ where }),
      this.db.note.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { occurredAt: "desc" },
      }),
    ]);
    return {
      items: items.map((x) => this.note(x)),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        total,
        parseSort(
          undefined,
          ["occurredAt"],
          [{ field: "occurredAt", direction: "desc" }],
        ),
      ),
    };
  }
  async getNote(id: string): Promise<NoteDetail> {
    const item = await this.db.note.findFirst({
      where: { id, workspaceId: this.context.workspaceId },
    });
    if (!item) throw new NotFoundException("Note not found");
    return this.note(item);
  }
  async createNote(input: CreateNoteDto): Promise<NoteDetail> {
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      eventId: input.eventId,
    });
    const item = await this.db.$transaction(async (tx) => {
      const note = await tx.note.create({
        data: {
          workspaceId: this.context.workspaceId,
          type: input.type,
          body: input.body.trim(),
          occurredAt: new Date(input.occurredAt),
          caseId: input.caseId,
          clientId: input.clientId,
          eventId: input.eventId,
          createdByUserId: this.context.userId,
        },
      });
      await this.log(tx, {
        action: "NOTE_CREATED",
        entityType: "Note",
        entityId: note.id,
        caseId: note.caseId,
        clientId: note.clientId,
        metadata: { type: note.type },
      });
      return note;
    });
    return this.note(item);
  }
  async updateNote(id: string, input: UpdateNoteDto): Promise<NoteDetail> {
    await this.validateContext({
      caseId: input.caseId,
      clientId: input.clientId,
      eventId: input.eventId,
    });
    const item = await this.db.$transaction(async (tx) => {
      const existing = await tx.note.findFirst({
        where: { id, workspaceId: this.context.workspaceId },
      });
      if (!existing) throw new NotFoundException("Note not found");
      const note = await tx.note.update({
        where: { id },
        data: {
          type: input.type,
          body: input.body.trim(),
          occurredAt: new Date(input.occurredAt),
          caseId: input.caseId,
          clientId: input.clientId,
          eventId: input.eventId,
        },
      });
      await this.log(tx, {
        action: "NOTE_UPDATED",
        entityType: "Note",
        entityId: id,
        caseId: note.caseId,
        clientId: note.clientId,
        metadata: { type: note.type },
      });
      return note;
    });
    return this.note(item);
  }

  async calendar(query: CalendarQueryDto): Promise<CalendarResponse> {
    const from = new Date(query.from);
    const to = new Date(query.to);
    if (to <= from)
      throw new BadRequestException("Calendar range must end after it starts");
    if (to.getTime() - from.getTime() > 1000 * 60 * 60 * 24 * 366)
      throw new BadRequestException("Calendar range is limited to one year");
    const take = Math.min(Math.max(query.limit ?? 100, 1), 100);
    const { workspaceId } = this.context;
    const sourceTypes = query.sourceTypes?.length
      ? query.sourceTypes
      : query.sourceType
        ? [query.sourceType]
        : (["EVENT", "TASK", "DEADLINE"] as const);
    const userIds = query.userIds ?? (query.userId ? [query.userId] : []);
    const statuses = query.statuses?.length
      ? query.statuses
      : query.status
        ? [query.status]
        : undefined;
    const eventStatuses = narrowStatuses(statuses, EVENT_STATUSES);
    const taskStatuses = narrowStatuses(statuses, TASK_STATUSES);
    const deadlineStatuses = narrowStatuses(statuses, DEADLINE_STATUSES);
    const [events, tasks, deadlines] = await Promise.all([
      !sourceTypes.includes("EVENT") || eventStatuses?.length === 0
        ? Promise.resolve([])
        : this.db.event.findMany({
            where: {
              workspaceId,
              startsAt: { lt: to },
              endsAt: { gt: from },
              ...(query.caseId && { caseId: query.caseId }),
              ...(query.clientId && {
                clients: { some: { clientId: query.clientId } },
              }),
              ...(userIds.length && {
                OR: [
                  { organizerUserId: { in: userIds } },
                  { assignees: { some: { userId: { in: userIds } } } },
                ],
              }),
              ...(eventStatuses && { status: { in: eventStatuses } }),
            },
            include: { clients: true, assignees: true },
            take: take + 1,
            orderBy: [{ startsAt: "asc" }, { id: "asc" }],
          }),
      !sourceTypes.includes("TASK") || taskStatuses?.length === 0
        ? Promise.resolve([])
        : this.db.task.findMany({
            where: {
              workspaceId,
              OR: [
                { dueAt: { gte: from, lt: to } },
                { dueDate: { gte: from, lt: to } },
                ...(query.includeNoDueDate
                  ? [{ dueAt: null, dueDate: null }]
                  : []),
              ],
              ...(query.caseId && { caseId: query.caseId }),
              ...(query.clientId && { clientId: query.clientId }),
              ...(userIds.length && { assigneeUserId: { in: userIds } }),
              ...(taskStatuses && { status: { in: taskStatuses } }),
            },
            take: take + 1,
            orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          }),
      !sourceTypes.includes("DEADLINE") || deadlineStatuses?.length === 0
        ? Promise.resolve([])
        : this.db.deadline.findMany({
            where: {
              workspaceId,
              OR: [
                { dueAt: { gte: from, lt: to } },
                { dueDate: { gte: from, lt: to } },
                ...(query.includeNoDueDate
                  ? [{ dueAt: null, dueDate: null }]
                  : []),
              ],
              ...(query.caseId && { caseId: query.caseId }),
              ...(query.clientId && { clientId: query.clientId }),
              ...(userIds.length && { responsibleUserId: { in: userIds } }),
              ...(deadlineStatuses && { status: { in: deadlineStatuses } }),
            },
            take: take + 1,
            orderBy: [{ dueAt: "asc" }, { id: "asc" }],
          }),
    ]);
    const items: CalendarItem[] = [
      ...events.map((x) => ({
        calendarId: `EVENT:${x.id}`,
        sourceType: "EVENT" as const,
        sourceId: x.id,
        title: x.title,
        status: x.status,
        startsAt: x.startsAt.toISOString(),
        endsAt: x.endsAt.toISOString(),
        date: null,
        timeZone: x.timeZone,
        caseId: x.caseId,
        clientId: x.clients[0]?.clientId ?? null,
        responsibleUserId: x.organizerUserId,
        assigneeUserIds: x.assignees.map((a) => a.userId),
      })),
      ...tasks.map((x) => ({
        calendarId: `TASK:${x.id}`,
        sourceType: "TASK" as const,
        sourceId: x.id,
        title: x.title,
        status: x.status,
        startsAt: x.dueAt?.toISOString() ?? null,
        endsAt: null,
        date: x.dueDate?.toISOString().slice(0, 10) ?? null,
        timeZone: null,
        caseId: x.caseId,
        clientId: x.clientId,
        responsibleUserId: x.assigneeUserId,
        assigneeUserIds: [x.assigneeUserId],
      })),
      ...deadlines.map((x) => ({
        calendarId: `DEADLINE:${x.id}`,
        sourceType: "DEADLINE" as const,
        sourceId: x.id,
        title: x.title,
        status: x.status,
        startsAt: x.dueAt?.toISOString() ?? null,
        endsAt: null,
        date: x.dueDate?.toISOString().slice(0, 10) ?? null,
        timeZone: x.timeZone,
        caseId: x.caseId,
        clientId: x.clientId,
        responsibleUserId: x.responsibleUserId,
        assigneeUserIds: [x.responsibleUserId],
      })),
    ].sort(
      (a, b) =>
        (a.startsAt ?? a.date ?? "").localeCompare(
          b.startsAt ?? b.date ?? "",
        ) || a.calendarId.localeCompare(b.calendarId),
    );
    const limited = items.slice(0, take);
    return {
      items: limited,
      nextCursor:
        items.length > take ? (limited.at(-1)?.calendarId ?? null) : null,
    };
  }

  async listActivity(
    query: ActivityListQueryDto,
  ): Promise<PaginatedResponse<ActivityLogSummary>> {
    const { workspaceId } = this.context;
    const where: Prisma.ActivityLogWhereInput = {
      workspaceId,
      ...(query.caseId && { caseId: query.caseId }),
      ...(query.clientId && { clientId: query.clientId }),
    };
    const [total, items] = await this.db.$transaction([
      this.db.activityLog.count({ where }),
      this.db.activityLog.findMany({
        where,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        orderBy: { occurredAt: "desc" },
      }),
    ]);
    return {
      items: items.map((x) => ({
        ...x,
        occurredAt: x.occurredAt.toISOString(),
        metadata: x.metadata as Record<string, unknown> | null,
      })),
      meta: paginationMeta(
        query.page,
        query.pageSize,
        total,
        parseSort(
          undefined,
          ["occurredAt"],
          [{ field: "occurredAt", direction: "desc" }],
        ),
      ),
    };
  }
}
