import { WorkspaceRole } from "@law/api-interfaces";
import { ActivitiesTasksDeadlinesService } from "@law/activities-tasks-deadlines";
import { WorkspaceContextService } from "@law/core";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const actorUserId = "22222222-2222-4222-a222-222222222222";
const recipientUserId = "33333333-3333-4333-a333-333333333333";

function run<T>(callback: () => Promise<T>): Promise<T> {
  return WorkspaceContextService.run(
    { workspaceId, userId: actorUserId, role: WorkspaceRole.OWNER },
    callback,
  );
}

function baseDb(tx: Record<string, unknown>) {
  return {
    workspaceMember: {
      count: jest
        .fn()
        .mockImplementation(({ where }) =>
          Promise.resolve(new Set(where.userId.in).size),
        ),
    },
    case: { findFirst: jest.fn() },
    client: { findFirst: jest.fn(), count: jest.fn() },
    clientContact: { count: jest.fn() },
    deadline: { findFirst: jest.fn() },
    event: { findFirst: jest.fn() },
    $transaction: jest.fn().mockImplementation((callback) => callback(tx)),
  };
}

function taskRow(
  assigneeUserId: string,
  updatedAt = new Date("2026-09-29T10:00:00Z"),
) {
  return {
    id: "task-1",
    workspaceId,
    title: "Pregledati nalaz",
    description: null,
    status: "TODO",
    priority: "NORMAL",
    assigneeUserId,
    dueDate: null,
    dueAt: null,
    caseId: null,
    clientId: null,
    deadlineId: null,
    completedAt: null,
    completedByUserId: null,
    createdByUserId: actorUserId,
    createdAt: new Date("2026-09-29T09:00:00Z"),
    updatedAt,
    assignee: {
      id: assigneeUserId,
      firstName: null,
      lastName: null,
      email: "user@example.com",
    },
    case: null,
    client: null,
    completedBy: null,
  };
}

describe("immediate domain notifications", () => {
  it("notifies another task assignee, skips self-assignment, and notifies a new assignee on reassignment", async () => {
    const create = jest.fn().mockResolvedValue({ status: "created" });
    const tx = {
      task: {
        create: jest
          .fn()
          .mockResolvedValueOnce(taskRow(recipientUserId))
          .mockResolvedValueOnce(taskRow(actorUserId)),
        findFirst: jest.fn().mockResolvedValue(taskRow(actorUserId)),
        update: jest
          .fn()
          .mockResolvedValue(
            taskRow(recipientUserId, new Date("2026-09-29T11:00:00Z")),
          ),
      },
      activityLog: { create: jest.fn() },
    };
    const service = new ActivitiesTasksDeadlinesService(
      baseDb(tx) as never,
      { create } as never,
    );

    await run(() =>
      service.createTask({
        title: "Pregledati nalaz",
        assigneeUserId: recipientUserId,
      }),
    );
    await run(() =>
      service.createTask({
        title: "Lični zadatak",
        assigneeUserId: actorUserId,
      }),
    );
    await run(() =>
      service.updateTask("task-1", {
        title: "Pregledati nalaz",
        assigneeUserId: recipientUserId,
      }),
    );

    expect(create).toHaveBeenCalledTimes(2);
    expect(
      create.mock.calls.map(([input]) => [input.type, input.userId]),
    ).toEqual([
      ["TASK_ASSIGNED", recipientUserId],
      ["TASK_ASSIGNED", recipientUserId],
    ]);
  });

  it("uses assignment instead of duplicate changed notification when a deadline owner changes", async () => {
    const create = jest.fn().mockResolvedValue({ status: "created" });
    const existing = {
      id: "deadline-1",
      workspaceId,
      responsibleUserId: actorUserId,
      dueDate: new Date("2026-10-05T00:00:00Z"),
      dueAt: null,
      timeZone: "Europe/Belgrade",
    };
    const updated = {
      ...existing,
      title: "Podneti žalbu",
      description: null,
      type: "COURT",
      status: "OPEN",
      responsibleUserId: recipientUserId,
      dueDate: new Date("2026-10-03T00:00:00Z"),
      caseId: null,
      clientId: null,
      sourceDescription: null,
      satisfiedAt: null,
      satisfiedByUserId: null,
      createdByUserId: actorUserId,
      createdAt: new Date("2026-09-20T00:00:00Z"),
      updatedAt: new Date("2026-09-29T12:00:00Z"),
      responsibleUser: {
        id: recipientUserId,
        firstName: null,
        lastName: null,
        email: "user@example.com",
      },
      case: null,
      client: null,
      satisfiedBy: null,
    };
    const tx = {
      deadline: {
        findFirst: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
      activityLog: { create: jest.fn() },
    };
    const service = new ActivitiesTasksDeadlinesService(
      baseDb(tx) as never,
      { create } as never,
    );

    await run(() =>
      service.updateDeadline("deadline-1", {
        title: "Podneti žalbu",
        type: "COURT",
        dueDate: "2026-10-03",
        timeZone: "Europe/Belgrade",
        responsibleUserId: recipientUserId,
      }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      type: "DEADLINE_ASSIGNED",
      userId: recipientUserId,
    });
  });

  it("notifies organizer/assignees about an event change without treating attendees as users", async () => {
    const create = jest.fn().mockResolvedValue({ status: "created" });
    const existing = {
      id: "event-1",
      workspaceId,
      startsAt: new Date("2026-10-05T08:00:00Z"),
      endsAt: new Date("2026-10-05T09:00:00Z"),
      location: "Sudnica 1",
      courtName: null,
      courtroom: null,
      meetingUrl: null,
    };
    const updated = {
      ...existing,
      type: "HEARING",
      title: "Ročište",
      description: null,
      startsAt: new Date("2026-10-05T10:00:00Z"),
      endsAt: new Date("2026-10-05T11:00:00Z"),
      timeZone: "Europe/Belgrade",
      isAllDay: false,
      status: "SCHEDULED",
      organizerUserId: actorUserId,
      caseId: null,
      createdByUserId: actorUserId,
      createdAt: new Date("2026-09-20T00:00:00Z"),
      updatedAt: new Date("2026-09-29T13:00:00Z"),
      organizer: {
        id: actorUserId,
        firstName: null,
        lastName: null,
        email: "actor@example.com",
      },
      case: null,
      clients: [],
      assignees: [
        {
          userId: recipientUserId,
          user: {
            id: recipientUserId,
            firstName: null,
            lastName: null,
            email: "user@example.com",
          },
        },
      ],
      attendees: [
        {
          id: "attendee-1",
          displayName: "External",
          email: "external@example.com",
          clientContactId: null,
        },
      ],
    };
    const tx = {
      event: {
        findFirstOrThrow: jest.fn().mockResolvedValue(existing),
        update: jest.fn().mockResolvedValue(updated),
      },
      activityLog: { create: jest.fn() },
    };
    const db = baseDb(tx);
    const service = new ActivitiesTasksDeadlinesService(
      db as never,
      { create } as never,
    );

    await run(() =>
      service.updateEvent("event-1", {
        type: "HEARING",
        title: "Ročište",
        startsAt: "2026-10-05T10:00:00Z",
        endsAt: "2026-10-05T11:00:00Z",
        timeZone: "Europe/Belgrade",
        assigneeUserIds: [recipientUserId],
        attendees: [{ displayName: "External", email: "external@example.com" }],
      }),
    );

    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0][0]).toMatchObject({
      type: "EVENT_CHANGED",
      userId: recipientUserId,
    });
    expect(JSON.stringify(create.mock.calls)).not.toContain(
      "external@example.com",
    );
  });
});
