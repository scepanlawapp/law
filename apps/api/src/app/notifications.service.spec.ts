import { NotificationType, Prisma } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import {
  NotificationReminderService,
  NotificationsService,
  reminderDayDifference,
} from "@law/notifications";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";

function context<T>(fn: () => T): T {
  return WorkspaceContextService.run(
    { workspaceId, userId, role: WorkspaceRole.LAWYER },
    fn,
  );
}

function createDb() {
  return {
    workspace: {
      findUnique: jest.fn().mockResolvedValue({
        config: { workspaceNotifications: true },
      }),
    },
    workspaceMember: {
      findUnique: jest.fn().mockResolvedValue({ status: "ACTIVE" }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    workEntry: { findMany: jest.fn().mockResolvedValue([]) },
    userSettings: {
      findUnique: jest.fn().mockResolvedValue({
        workspaceNotifications: true,
        notificationPreferences: null,
      }),
    },
    notification: {
      create: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: "notification-1",
          isRead: false,
          readAt: null,
          createdAt: new Date("2026-09-29T09:00:00Z"),
          updatedAt: new Date("2026-09-29T09:00:00Z"),
          metadata: null,
          entityType: null,
          entityId: null,
          dedupeKey: null,
          ...data,
        }),
      ),
      createMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockImplementation(({ where }) =>
        Promise.resolve({
          id: "notification-1",
          workspaceId,
          userId,
          type: "TASK_ASSIGNED",
          title: "Dodeljen zadatak",
          message: "Pregledati nalaz",
          entityType: null,
          entityId: null,
          metadata: null,
          isRead: false,
          readAt: null,
          dedupeKey: where.workspaceId_userId_dedupeKey.dedupeKey,
          createdAt: new Date("2026-09-29T09:00:00Z"),
          updatedAt: new Date("2026-09-29T09:00:00Z"),
        }),
      ),
      count: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest
      .fn()
      .mockImplementation((operations) => Promise.all(operations)),
    task: { findMany: jest.fn().mockResolvedValue([]) },
    deadline: { findMany: jest.fn().mockResolvedValue([]) },
    event: { findMany: jest.fn().mockResolvedValue([]) },
  };
}

describe("NotificationsService", () => {
  it("defaults missing preference JSON and missing keys to enabled", () => {
    const service = new NotificationsService(createDb() as never);
    expect(service.isTypeEnabled(null, "TASK_ASSIGNED")).toBe(true);
    expect(service.isTypeEnabled({}, "TASK_ASSIGNED")).toBe(true);
    expect(
      service.isTypeEnabled({ taskAssigned: false }, "TASK_ASSIGNED"),
    ).toBe(false);
  });

  it("creates enabled notifications and respects user, workspace, and type switches", async () => {
    const db = createDb();
    const service = new NotificationsService(db as never);
    const input = {
      workspaceId,
      userId,
      type: "TASK_ASSIGNED" as NotificationType,
      title: "Dodeljen zadatak",
      message: "Pregledati nalaz",
      dedupeKey: "task:1:assigned:user",
    };

    await expect(service.create(input)).resolves.toMatchObject({
      status: "created",
    });
    db.userSettings.findUnique.mockResolvedValueOnce({
      workspaceNotifications: false,
      notificationPreferences: null,
    });
    await expect(service.create(input)).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });
    db.workspace.findUnique.mockResolvedValueOnce({
      config: { workspaceNotifications: false },
    });
    await expect(service.create(input)).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });
    db.userSettings.findUnique.mockResolvedValueOnce({
      workspaceNotifications: true,
      notificationPreferences: { taskAssigned: false },
    });
    await expect(service.create(input)).resolves.toEqual({
      status: "skipped",
      reason: "disabled",
    });
  });

  it("treats database unique conflicts as idempotent duplicates", async () => {
    const db = createDb();
    db.notification.createMany.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "6.16.2",
      }),
    );
    const service = new NotificationsService(db as never);
    await expect(
      service.create({
        workspaceId,
        userId,
        type: "TASK_DUE_SOON",
        title: "Zadatak dospeva sutra",
        message: "Pregledati nalaz",
        dedupeKey: "task:1:due-soon:1d:2026-09-30:user",
      }),
    ).resolves.toEqual({ status: "skipped", reason: "duplicate" });
  });

  it("uses an atomic insert-or-skip path when the same scheduler key runs twice", async () => {
    const db = createDb();
    db.notification.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const service = new NotificationsService(db as never);
    const input = {
      workspaceId,
      userId,
      type: "DEADLINE_DUE_SOON" as NotificationType,
      title: "Rok se približava",
      message: "Podneti žalbu",
      dedupeKey: "deadline:1:due-soon:3d:2026-10-02:user",
    };

    await expect(service.create(input)).resolves.toMatchObject({
      status: "created",
    });
    await expect(service.create(input)).resolves.toEqual({
      status: "skipped",
      reason: "duplicate",
    });
    expect(db.notification.createMany).toHaveBeenCalledTimes(2);
    expect(db.notification.findUniqueOrThrow).toHaveBeenCalledTimes(1);
  });

  it("scopes listing and read mutations to the authenticated user and workspace", async () => {
    const db = createDb();
    db.notification.count.mockResolvedValue(1);
    db.notification.findMany.mockResolvedValue([]);
    db.notification.findFirst.mockResolvedValue(null);
    db.notification.updateMany.mockResolvedValue({ count: 2 });
    const service = new NotificationsService(db as never);

    await context(() => service.list(2, 10));
    expect(db.notification.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId, userId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip: 10,
        take: 10,
      }),
    );
    await expect(context(() => service.markRead("foreign"))).rejects.toThrow(
      "Notification not found",
    );
    expect(db.notification.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign", workspaceId, userId },
    });
    await expect(context(() => service.markAllRead())).resolves.toEqual({
      updated: 2,
    });
    expect(db.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId, userId, isRead: false },
      }),
    );
  });
});

describe("NotificationReminderService", () => {
  const now = new Date("2026-09-29T10:00:00.000Z");

  it("uses timezone calendar dates across timestamp and date-only targets", () => {
    expect(
      reminderDayDifference(
        { dueAt: new Date("2026-09-30T00:30:00.000Z") },
        now,
        "Europe/Belgrade",
      ),
    ).toBe(1);
    expect(
      reminderDayDifference(
        { dueDate: new Date("2026-09-28T00:00:00.000Z") },
        now,
        "Europe/Belgrade",
      ),
    ).toBe(-1);
  });

  it("generates task/deadline windows and event reminders only for internal recipients", async () => {
    const db = createDb();
    db.task.findMany.mockResolvedValue([
      {
        id: "task-1",
        workspaceId,
        assigneeUserId: userId,
        title: "Pregledati nalaz",
        dueDate: new Date("2026-09-30T00:00:00.000Z"),
        dueAt: null,
        case: null,
        client: null,
        assignee: { settings: null },
        workspace: { config: { timeZone: "Europe/Belgrade" } },
      },
    ]);
    db.deadline.findMany.mockResolvedValue(
      [7, 3, 1, 0, -1].map((days) => ({
        id: `deadline-${days}`,
        workspaceId,
        responsibleUserId: userId,
        title: `Rok ${days}`,
        dueDate: new Date(Date.UTC(2026, 8, 29 + days, 0, 0, 0)),
        dueAt: null,
        timeZone: "Europe/Belgrade",
        case: null,
        client: null,
        workspace: { config: null },
      })),
    );
    db.event.findMany.mockResolvedValue([
      {
        id: "event-1",
        workspaceId,
        organizerUserId: "organizer",
        title: "Ročište",
        startsAt: new Date("2026-09-30T08:00:00.000Z"),
        timeZone: "Europe/Belgrade",
        case: null,
        clients: [],
        assignees: [{ userId }, { userId: "organizer" }],
        attendees: [{ displayName: "External attendee" }],
      },
    ]);
    const create = jest.fn().mockResolvedValue({ status: "created" });
    const service = new NotificationReminderService(
      db as never,
      {
        create,
      } as never,
    );

    await service.run(now);

    const calls = create.mock.calls.map(([input]) => input);
    expect(calls.map((input) => input.type)).toEqual(
      expect.arrayContaining([
        "TASK_DUE_SOON",
        "DEADLINE_DUE_SOON",
        "DEADLINE_DUE_TODAY",
        "DEADLINE_OVERDUE",
        "EVENT_UPCOMING",
      ]),
    );
    expect(
      calls.filter((input) => input.type === "DEADLINE_DUE_SOON"),
    ).toHaveLength(3);
    const eventRecipients = calls
      .filter((input) => input.type === "EVENT_UPCOMING")
      .map((input) => input.userId)
      .sort();
    expect(eventRecipients).toEqual(["organizer", userId].sort());
    expect(eventRecipients).not.toContain("External attendee");
  });

  it("changes reminder dedupe keys when a deadline is rescheduled", async () => {
    const db = createDb();
    const deadline = {
      id: "deadline-1",
      workspaceId,
      responsibleUserId: userId,
      title: "Žalba",
      dueDate: new Date("2026-09-30T00:00:00.000Z"),
      dueAt: null,
      timeZone: "Europe/Belgrade",
      case: null,
      client: null,
      workspace: { config: null },
    };
    db.deadline.findMany.mockResolvedValue([deadline]);
    const create = jest.fn().mockResolvedValue({ status: "created" });
    const service = new NotificationReminderService(
      db as never,
      {
        create,
      } as never,
    );
    await service.run(now);
    const firstKey = create.mock.calls[0][0].dedupeKey;
    deadline.dueDate = new Date("2026-10-06T00:00:00.000Z");
    await service.run(new Date("2026-10-05T10:00:00.000Z"));
    const secondKey = create.mock.calls[1][0].dedupeKey;
    expect(secondKey).not.toBe(firstKey);
  });
  describe("time tracking reminders", () => {
    const reminderMember = (time = "17:30", timeZone = "Europe/Belgrade") => ({
      userId,
      workspaceId,
      user: { settings: { timeZone, timeReviewReminderTime: time } },
      workspace: { config: null },
    });
    const run = async (db: ReturnType<typeof createDb>, at: Date) => {
      const create = jest.fn().mockResolvedValue({ status: "created" });
      await new NotificationReminderService(
        db as never,
        { create } as never,
      ).run(at);
      return create.mock.calls.map(([input]) => input);
    };

    it("notifies a timer that has run for 4 hours or more", async () => {
      const db = createDb();
      const startedAt = new Date("2026-09-30T06:00:00.000Z");
      db.workEntry.findMany.mockResolvedValue([
        {
          id: "entry-1",
          workspaceId,
          userId,
          description: "Priprema tužbe",
          timerStartedAt: startedAt,
          client: { id: "client-1", displayName: "Alfa doo" },
          workspace: { config: { timeZone: "Europe/Belgrade" } },
        },
      ]);
      const calls = await run(db, new Date("2026-09-30T10:10:00.000Z"));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        type: "TIMER_RUNNING_LONG",
        userId,
        title: "Tajmer je i dalje uključen",
        dedupeKey: `timer:entry-1:${startedAt.toISOString()}`,
      });
    });

    it("leaves a young same-day timer alone but flags one past local midnight", async () => {
      const db = createDb();
      const entry = (startedAt: string) => ({
        id: "entry-1",
        workspaceId,
        userId,
        description: "",
        timerStartedAt: new Date(startedAt),
        client: { id: "client-1", displayName: "Alfa doo" },
        workspace: { config: null },
      });
      db.workEntry.findMany.mockResolvedValue([
        entry("2026-09-30T07:00:00.000Z"),
      ]);
      expect(await run(db, new Date("2026-09-30T09:00:00.000Z"))).toEqual([]);
      // 22:30 Belgrade the evening before; 00:30 Belgrade now: only 2 h old.
      db.workEntry.findMany.mockResolvedValue([
        entry("2026-09-29T20:30:00.000Z"),
      ]);
      const calls = await run(db, new Date("2026-09-29T22:30:00.000Z"));
      expect(calls.map((input) => input.type)).toEqual(["TIMER_RUNNING_LONG"]);
    });

    it("sends the review reminder on a weekday after the configured time", async () => {
      const db = createDb();
      db.workspaceMember.findMany.mockResolvedValue([reminderMember()]);
      // Wednesday 2026-09-30, 18:05 Belgrade (CEST, UTC+2).
      const calls = await run(db, new Date("2026-09-30T16:05:00.000Z"));
      expect(calls).toHaveLength(1);
      expect(calls[0]).toMatchObject({
        type: "TIME_REVIEW_REMINDER",
        userId,
        dedupeKey: "time-review:2026-09-30",
      });
    });

    it("waits until the configured time and skips weekends", async () => {
      const db = createDb();
      db.workspaceMember.findMany.mockResolvedValue([reminderMember()]);
      // Wednesday 17:00 Belgrade: too early.
      expect(await run(db, new Date("2026-09-30T15:00:00.000Z"))).toEqual([]);
      // Saturday 2026-10-03, 18:05 Belgrade.
      expect(await run(db, new Date("2026-10-03T16:05:00.000Z"))).toEqual([]);
    });
  });
});
