import { DeadlineDetail, EventDetail, TaskDetail } from "@law/api-interfaces";
import {
  deadlineToWorkItem,
  eventToWorkItem,
  mergePage,
  sortWorkItems,
  statusTransition,
  taskToWorkItem,
  WorkItem,
} from "./work-view.models";

function makeTask(overrides: Partial<TaskDetail> = {}): TaskDetail {
  return {
    id: "task-1",
    title: "Draft brief",
    description: null,
    status: "TODO",
    priority: "NORMAL",
    assigneeUserId: "user-1",
    dueDate: null,
    dueAt: null,
    caseId: "case-1",
    clientId: null,
    deadlineId: null,
    completedAt: null,
    completedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeadline(overrides: Partial<DeadlineDetail> = {}): DeadlineDetail {
  return {
    id: "deadline-1",
    title: "File appeal",
    description: null,
    type: "COURT",
    dueDate: "2026-02-01",
    dueAt: null,
    timeZone: null,
    status: "OPEN",
    overdue: false,
    responsibleUserId: "user-2",
    caseId: "case-1",
    clientId: null,
    sourceDescription: null,
    satisfiedAt: null,
    satisfiedByUserId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeEvent(overrides: Partial<EventDetail> = {}): EventDetail {
  return {
    id: "event-1",
    type: "MEETING",
    title: "Client call",
    description: null,
    startsAt: "2026-01-05T10:00:00.000Z",
    endsAt: "2026-01-05T11:00:00.000Z",
    timeZone: "Europe/Belgrade",
    isAllDay: false,
    status: "SCHEDULED",
    location: null,
    meetingUrl: null,
    courtName: null,
    courtroom: null,
    organizerUserId: "user-3",
    caseId: "case-1",
    clientIds: [],
    assigneeUserIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    attendees: [],
    ...overrides,
  };
}

describe("work-view.models status mapping", () => {
  it("maps task statuses 1:1 to presentation status", () => {
    expect(
      taskToWorkItem(makeTask({ status: "TODO" })).presentationStatus,
    ).toBe("TODO");
    expect(
      taskToWorkItem(makeTask({ status: "IN_PROGRESS" })).presentationStatus,
    ).toBe("IN_PROGRESS");
    expect(
      taskToWorkItem(makeTask({ status: "DONE" })).presentationStatus,
    ).toBe("DONE");
    expect(
      taskToWorkItem(makeTask({ status: "CANCELLED" })).presentationStatus,
    ).toBe("CANCELLED");
  });

  it("maps deadline statuses without inventing an in-progress state", () => {
    expect(
      deadlineToWorkItem(makeDeadline({ status: "OPEN" })).presentationStatus,
    ).toBe("TODO");
    expect(
      deadlineToWorkItem(makeDeadline({ status: "SATISFIED" }))
        .presentationStatus,
    ).toBe("DONE");
    expect(
      deadlineToWorkItem(makeDeadline({ status: "CANCELLED" }))
        .presentationStatus,
    ).toBe("CANCELLED");
  });

  it("maps event statuses without inventing an in-progress state", () => {
    expect(
      eventToWorkItem(makeEvent({ status: "SCHEDULED" })).presentationStatus,
    ).toBe("TODO");
    expect(
      eventToWorkItem(makeEvent({ status: "COMPLETED" })).presentationStatus,
    ).toBe("DONE");
    expect(
      eventToWorkItem(makeEvent({ status: "CANCELLED" })).presentationStatus,
    ).toBe("CANCELLED");
  });

  it("falls back to the organizer when an event has no assignees", () => {
    const item = eventToWorkItem(makeEvent({ assigneeUserIds: [] }));
    expect(item.ownerUserIds).toEqual(["user-3"]);
  });

  it("prefers explicit assignees over the organizer", () => {
    const item = eventToWorkItem(
      makeEvent({ assigneeUserIds: ["user-9"], organizerUserId: "user-3" }),
    );
    expect(item.ownerUserIds).toEqual(["user-9"]);
  });
});

describe("sortWorkItems", () => {
  it("sorts by due date ascending and pushes items without a due date last", () => {
    const items: WorkItem[] = [
      taskToWorkItem(makeTask({ id: "a", dueDate: "2026-03-01" })),
      taskToWorkItem(makeTask({ id: "b", dueDate: null, dueAt: null })),
      taskToWorkItem(makeTask({ id: "c", dueDate: "2026-01-01" })),
    ];
    expect(sortWorkItems(items).map((item) => item.id)).toEqual([
      "c",
      "a",
      "b",
    ]);
  });
});

describe("mergePage", () => {
  it("appends new rows without duplicating already-loaded ones", () => {
    const page1 = [{ id: "1" }, { id: "2" }];
    const page2 = [{ id: "2" }, { id: "3" }];
    expect(mergePage(page1, page2)).toEqual([
      { id: "1" },
      { id: "2" },
      { id: "3" },
    ]);
  });

  it("never silently drops previously loaded rows", () => {
    const page1 = [{ id: "1" }];
    expect(mergePage(page1, [])).toEqual([{ id: "1" }]);
  });
});

describe("statusTransition", () => {
  it("allows a task to move between to-do, in-progress and done", () => {
    const todo = taskToWorkItem(makeTask({ status: "TODO" }));
    const inProgress = taskToWorkItem(makeTask({ status: "IN_PROGRESS" }));
    const done = taskToWorkItem(makeTask({ status: "DONE" }));

    expect(statusTransition(todo, "IN_PROGRESS")).toEqual({
      action: "task-set-in-progress",
    });
    expect(statusTransition(inProgress, "TODO")).toEqual({
      action: "task-set-todo",
    });
    expect(statusTransition(todo, "DONE")).toEqual({ action: "task-complete" });
    expect(statusTransition(done, "TODO")).toEqual({ action: "task-reopen" });
  });

  it("never allows dragging into or out of cancelled", () => {
    const todo = taskToWorkItem(makeTask({ status: "TODO" }));
    const cancelled = taskToWorkItem(makeTask({ status: "CANCELLED" }));
    expect(statusTransition(todo, "CANCELLED")).toBeNull();
    expect(statusTransition(cancelled, "TODO")).toBeNull();
    expect(statusTransition(cancelled, "DONE")).toBeNull();
  });

  it("never allows a deadline into the in-progress column", () => {
    const open = deadlineToWorkItem(makeDeadline({ status: "OPEN" }));
    expect(statusTransition(open, "IN_PROGRESS")).toBeNull();
    expect(statusTransition(open, "DONE")).toEqual({
      action: "deadline-satisfy",
    });
  });

  it("never allows an event to reopen from done or cancelled", () => {
    const done = eventToWorkItem(makeEvent({ status: "COMPLETED" }));
    const cancelled = eventToWorkItem(makeEvent({ status: "CANCELLED" }));
    expect(statusTransition(done, "TODO")).toBeNull();
    expect(statusTransition(cancelled, "TODO")).toBeNull();
    const todo = eventToWorkItem(makeEvent({ status: "SCHEDULED" }));
    expect(statusTransition(todo, "DONE")).toEqual({
      action: "event-complete",
    });
    expect(statusTransition(todo, "IN_PROGRESS")).toBeNull();
  });
});
