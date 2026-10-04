import { BadRequestException } from "@nestjs/common";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { ActivitiesTasksDeadlinesService } from "@law/activities-tasks-deadlines";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const caseId = "33333333-3333-4333-a333-333333333333";
const clientId = "44444444-4444-4444-a444-444444444444";

describe("ActivitiesTasksDeadlinesService validation", () => {
  const db = {
    case: { findFirst: jest.fn() },
    client: { findFirst: jest.fn(), count: jest.fn() },
    workspaceMember: { count: jest.fn() },
    deadline: { findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
  };
  const service = new ActivitiesTasksDeadlinesService(
    db as never,
    {
      create: jest.fn().mockResolvedValue({ status: "created" }),
    } as never,
    { ensureForSource: jest.fn() } as never,
  );
  const run = <T>(callback: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.OWNER } as never,
      callback,
    );

  beforeEach(() => {
    jest.clearAllMocks();
    db.workspaceMember.count.mockResolvedValue(1);
    db.client.count.mockResolvedValue(1);
    db.client.findFirst.mockResolvedValue({ id: clientId });
    db.case.findFirst.mockResolvedValue({ id: caseId, clientId });
    db.deadline.findFirst.mockResolvedValue({
      id: "55555555-5555-4555-a555-555555555555",
      caseId,
      clientId,
    });
    db.event.findFirst.mockResolvedValue({
      id: "66666666-6666-4666-a666-666666666666",
      caseId,
    });
  });

  it("rejects an event whose end is not after its start", async () => {
    await expect(
      run(() =>
        service.createEvent({
          type: "MEETING",
          title: "Meeting",
          startsAt: "2026-09-17T10:00:00.000Z",
          endsAt: "2026-09-17T10:00:00.000Z",
          timeZone: "Europe/Belgrade",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a task with both date-only and exact-time targets", async () => {
    await expect(
      run(() =>
        service.createTask({
          title: "Review",
          assigneeUserId: userId,
          dueDate: "2026-09-18",
          dueAt: "2026-09-18T10:00:00.000Z",
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires exactly one deadline target", async () => {
    await expect(
      run(() =>
        service.createDeadline({
          title: "Submit response",
          type: "COURT",
          timeZone: "Europe/Belgrade",
          responsibleUserId: userId,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a direct client that does not belong to the supplied case", async () => {
    db.case.findFirst.mockResolvedValue({
      id: caseId,
      clientId: "77777777-7777-4777-a777-777777777777",
    });
    await expect(
      run(() =>
        service.createTask({
          title: "Review",
          assigneeUserId: userId,
          caseId,
          clientId,
        }),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe("ActivitiesTasksDeadlinesService work entries from completed work", () => {
  const performerId = "88888888-8888-4888-a888-888888888888";
  const otherClientId = "77777777-7777-4777-a777-777777777777";
  const taskId = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
  const eventId = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
  const deadlineId = "cccccccc-cccc-4ccc-cccc-cccccccccccc";
  const user = {
    id: performerId,
    firstName: "Ana",
    lastName: null,
    email: "a@x.test",
  };
  // 22:30 UTC on 4 Oct is already 5 Oct in Belgrade.
  const now = new Date("2026-10-04T22:30:00.000Z");
  const completionDate = new Date("2026-10-05T00:00:00.000Z");

  const tx = {
    task: { findFirst: jest.fn(), update: jest.fn() },
    event: { findFirst: jest.fn(), update: jest.fn() },
    deadline: { findFirst: jest.fn(), update: jest.fn() },
    case: { findFirst: jest.fn() },
    activityLog: { create: jest.fn() },
  };
  const db = {
    $transaction: jest.fn(),
    task: { findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
    deadline: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    client: { findFirst: jest.fn(), count: jest.fn() },
    workspaceMember: { count: jest.fn() },
  };
  const ensureForSource = jest.fn();
  const notifications = { create: jest.fn() };
  const service = new ActivitiesTasksDeadlinesService(
    db as never,
    notifications as never,
    { ensureForSource } as never,
  );
  const run = <T>(callback: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.OWNER } as never,
      callback,
    );

  const stamps = { createdAt: now, updatedAt: now };
  function taskRow(overrides: Record<string, unknown> = {}) {
    return {
      id: taskId,
      workspaceId,
      title: "Pregled ugovora",
      description: null,
      status: "TODO",
      priority: "NORMAL",
      assigneeUserId: performerId,
      assignee: user,
      dueDate: null,
      dueAt: null,
      caseId: null,
      clientId: null,
      case: null,
      client: null,
      deadlineId: null,
      completedAt: null,
      completedBy: null,
      ...stamps,
      ...overrides,
    };
  }
  function eventRow(overrides: Record<string, unknown> = {}) {
    return {
      id: eventId,
      workspaceId,
      type: "MEETING",
      title: "Sastanak sa klijentom",
      description: null,
      startsAt: new Date("2026-10-04T08:00:00.000Z"),
      endsAt: new Date("2026-10-04T09:30:00.000Z"),
      timeZone: "Europe/Belgrade",
      isAllDay: false,
      status: "SCHEDULED",
      organizerUserId: performerId,
      organizer: user,
      caseId: null,
      case: null,
      clients: [],
      assignees: [],
      attendees: [],
      ...stamps,
      ...overrides,
    };
  }
  function deadlineRow(overrides: Record<string, unknown> = {}) {
    return {
      id: deadlineId,
      workspaceId,
      title: "Odgovor na tužbu",
      description: null,
      type: "COURT",
      dueDate: null,
      dueAt: null,
      timeZone: "Europe/Belgrade",
      status: "OPEN",
      satisfiedAt: null,
      responsibleUserId: performerId,
      responsibleUser: user,
      caseId: null,
      clientId: null,
      case: null,
      client: null,
      satisfiedBy: null,
      sourceDescription: null,
      ...stamps,
      ...overrides,
    };
  }

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });
  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback) => callback(tx));
    db.workspaceMember.count.mockResolvedValue(1);
    db.case.findFirst.mockResolvedValue(null);
    db.client.findFirst.mockResolvedValue({ id: clientId });
    tx.activityLog.create.mockResolvedValue({});
    tx.case.findFirst.mockResolvedValue(null);
    ensureForSource.mockResolvedValue("entry-1");
  });

  describe("transitionTask", () => {
    it("proposes an entry for the assignee inside the same transaction", async () => {
      tx.task.findFirst.mockResolvedValue(taskRow({ clientId }));
      tx.task.update.mockResolvedValue(taskRow({ clientId, status: "DONE" }));
      db.task.findFirst.mockResolvedValue(taskRow({ status: "DONE" }));

      await run(() => service.transitionTask(taskId, "DONE"));

      expect(ensureForSource).toHaveBeenCalledTimes(1);
      expect(ensureForSource).toHaveBeenCalledWith(tx, {
        workspaceId,
        actorUserId: userId,
        sourceType: "TASK",
        sourceId: taskId,
        performerUserId: performerId,
        clientIds: [clientId],
        caseId: null,
        workDate: completionDate,
        description: "Pregled ugovora",
        minutes: null,
        confirm: false,
      });
    });

    it("takes the client from the case as well as the task", async () => {
      tx.task.findFirst.mockResolvedValue(taskRow({ caseId }));
      tx.task.update.mockResolvedValue(taskRow({ caseId, status: "DONE" }));
      tx.case.findFirst.mockResolvedValue({ clientId });
      db.task.findFirst.mockResolvedValue(taskRow({ status: "DONE" }));

      await run(() => service.transitionTask(taskId, "DONE"));

      expect(ensureForSource).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ clientIds: [clientId], caseId }),
      );
      expect(tx.case.findFirst).toHaveBeenCalledWith({
        where: { id: caseId, workspaceId },
        select: { clientId: true },
      });
    });

    it("still completes a task without any client", async () => {
      ensureForSource.mockResolvedValue(null);
      tx.task.findFirst.mockResolvedValue(taskRow());
      tx.task.update.mockResolvedValue(taskRow({ status: "DONE" }));
      db.task.findFirst.mockResolvedValue(taskRow({ status: "DONE" }));

      const result = await run(() => service.transitionTask(taskId, "DONE"));

      expect(result.status).toBe("DONE");
      expect(ensureForSource).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ clientIds: [] }),
      );
    });

    it("does not create entries when reopening or cancelling, and re-completing reuses the source id", async () => {
      tx.task.findFirst.mockResolvedValue(taskRow({ clientId }));
      tx.task.update.mockResolvedValue(taskRow({ clientId }));
      db.task.findFirst.mockResolvedValue(taskRow());

      await run(() => service.transitionTask(taskId, "TODO"));
      await run(() => service.transitionTask(taskId, "CANCELLED"));
      expect(ensureForSource).not.toHaveBeenCalled();

      await run(() => service.transitionTask(taskId, "DONE"));
      await run(() => service.transitionTask(taskId, "DONE"));
      expect(ensureForSource).toHaveBeenCalledTimes(2);
      // ensureForSource is idempotent per (sourceType, sourceId).
      for (const [, input] of ensureForSource.mock.calls) {
        expect(input).toEqual(
          expect.objectContaining({ sourceType: "TASK", sourceId: taskId }),
        );
      }
    });
  });

  describe("updateTask", () => {
    const update = {
      title: "Pregled ugovora",
      assigneeUserId: performerId,
      status: "DONE" as const,
      clientId,
    };

    it("proposes an entry when the status becomes DONE", async () => {
      tx.task.findFirst.mockResolvedValue(taskRow({ clientId }));
      tx.task.update.mockResolvedValue(taskRow({ clientId, status: "DONE" }));

      await run(() => service.updateTask(taskId, update));

      expect(ensureForSource).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({
          sourceType: "TASK",
          sourceId: taskId,
          performerUserId: performerId,
          clientIds: [clientId],
        }),
      );
    });

    it("does nothing when the task was already DONE or stays open", async () => {
      tx.task.findFirst.mockResolvedValue(
        taskRow({ clientId, status: "DONE" }),
      );
      tx.task.update.mockResolvedValue(taskRow({ clientId, status: "DONE" }));
      await run(() => service.updateTask(taskId, update));

      tx.task.findFirst.mockResolvedValue(taskRow({ clientId }));
      tx.task.update.mockResolvedValue(
        taskRow({ clientId, status: "IN_PROGRESS" }),
      );
      await run(() =>
        service.updateTask(taskId, { ...update, status: "IN_PROGRESS" }),
      );

      expect(ensureForSource).not.toHaveBeenCalled();
    });
  });

  describe("transitionEvent", () => {
    it("proposes an entry for the organizer with the event duration", async () => {
      tx.event.findFirst.mockResolvedValue(
        eventRow({
          clients: [{ clientId, client: {} }],
          caseId,
          case: { id: caseId, clientId: otherClientId },
        }),
      );
      tx.event.update.mockResolvedValue(
        eventRow({
          status: "COMPLETED",
          clients: [{ clientId, client: {} }],
          caseId,
          case: { id: caseId, clientId },
        }),
      );
      db.event.findFirst.mockResolvedValue(eventRow({ status: "COMPLETED" }));

      await run(() => service.transitionEvent(eventId, "COMPLETED"));

      expect(ensureForSource).toHaveBeenCalledWith(tx, {
        workspaceId,
        actorUserId: userId,
        sourceType: "EVENT",
        sourceId: eventId,
        performerUserId: performerId,
        clientIds: [clientId, clientId],
        caseId,
        workDate: completionDate,
        description: "Sastanak sa klijentom",
        minutes: 90,
        confirm: false,
      });
    });

    it("passes both clients through so ensureForSource can refuse an ambiguous event", async () => {
      tx.event.findFirst.mockResolvedValue(eventRow());
      tx.event.update.mockResolvedValue(
        eventRow({
          status: "COMPLETED",
          clients: [{ clientId, client: {} }],
          caseId,
          case: { id: caseId, clientId: otherClientId },
        }),
      );
      db.event.findFirst.mockResolvedValue(eventRow({ status: "COMPLETED" }));

      await run(() => service.transitionEvent(eventId, "COMPLETED"));

      expect(ensureForSource).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ clientIds: [clientId, otherClientId] }),
      );
    });

    it("proposes without minutes for an all-day event and ignores cancellation", async () => {
      tx.event.findFirst.mockResolvedValue(eventRow());
      tx.event.update.mockResolvedValue(
        eventRow({ status: "COMPLETED", isAllDay: true }),
      );
      db.event.findFirst.mockResolvedValue(eventRow({ status: "COMPLETED" }));
      await run(() => service.transitionEvent(eventId, "COMPLETED"));
      expect(ensureForSource).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ minutes: null }),
      );

      ensureForSource.mockClear();
      tx.event.update.mockResolvedValue(eventRow({ status: "CANCELLED" }));
      db.event.findFirst.mockResolvedValue(eventRow({ status: "CANCELLED" }));
      await run(() => service.transitionEvent(eventId, "CANCELLED"));
      expect(ensureForSource).not.toHaveBeenCalled();
    });
  });

  describe("transitionDeadline", () => {
    it("proposes an entry for the responsible user when satisfied", async () => {
      tx.deadline.findFirst.mockResolvedValue(deadlineRow({ clientId }));
      tx.deadline.update.mockResolvedValue(
        deadlineRow({ clientId, status: "SATISFIED" }),
      );
      db.deadline.findFirst.mockResolvedValue(
        deadlineRow({ status: "SATISFIED" }),
      );

      await run(() => service.transitionDeadline(deadlineId, "SATISFIED"));

      expect(ensureForSource).toHaveBeenCalledWith(tx, {
        workspaceId,
        actorUserId: userId,
        sourceType: "DEADLINE",
        sourceId: deadlineId,
        performerUserId: performerId,
        clientIds: [clientId],
        caseId: null,
        workDate: completionDate,
        description: "Odgovor na tužbu",
        minutes: null,
        confirm: false,
      });
    });

    it("creates nothing when the deadline is cancelled or reopened", async () => {
      tx.deadline.findFirst.mockResolvedValue(deadlineRow({ clientId }));
      tx.deadline.update.mockResolvedValue(deadlineRow({ clientId }));
      db.deadline.findFirst.mockResolvedValue(deadlineRow());

      await run(() => service.transitionDeadline(deadlineId, "CANCELLED"));
      await run(() => service.transitionDeadline(deadlineId, "OPEN"));

      expect(ensureForSource).not.toHaveBeenCalled();
    });
  });
});
