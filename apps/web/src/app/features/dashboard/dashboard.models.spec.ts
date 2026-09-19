import { CalendarItem } from "@law/api-interfaces";
import {
  activityLogToFeedItem,
  calendarItemToObligation,
  caseSummaryToPreviewRow,
} from "./dashboard.models";

function calendarItem(overrides: Partial<CalendarItem>): CalendarItem {
  return {
    calendarId: "EVENT:1",
    sourceType: "EVENT",
    sourceId: "1",
    title: "Hearing",
    status: "SCHEDULED",
    startsAt: new Date(Date.now() + 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 7_200_000).toISOString(),
    date: null,
    timeZone: "Europe/Belgrade",
    caseId: null,
    clientId: null,
    responsibleUserId: null,
    assigneeUserIds: [],
    ...overrides,
  };
}

describe("calendarItemToObligation", () => {
  it("is not overdue for a future scheduled event", () => {
    expect(calendarItemToObligation(calendarItem({})).overdue).toBe(false);
  });

  it("is overdue for a past-due open task not yet completed", () => {
    const item = calendarItem({
      sourceType: "TASK",
      status: "TODO",
      startsAt: null,
      date: "2000-01-01",
    });
    expect(calendarItemToObligation(item).overdue).toBe(true);
  });

  it("is never overdue once completed, even if the date is in the past", () => {
    const item = calendarItem({
      sourceType: "TASK",
      status: "DONE",
      startsAt: null,
      date: "2000-01-01",
    });
    expect(calendarItemToObligation(item).overdue).toBe(false);
  });

  it("preserves date-only values without fabricating a time", () => {
    const item = calendarItem({
      sourceType: "DEADLINE",
      status: "OPEN",
      startsAt: null,
      date: "2030-01-01",
    });
    const result = calendarItemToObligation(item);
    expect(result.date).toBe("2030-01-01");
    expect(result.startsAt).toBeNull();
  });
});

describe("activityLogToFeedItem", () => {
  it("maps a known action to its translation key", () => {
    const result = activityLogToFeedItem(
      {
        id: "1",
        action: "TASK_CREATED",
        actorUserId: "u1",
        occurredAt: "2026-01-01T00:00:00.000Z",
        caseId: null,
        clientId: null,
        entityType: "Task",
        entityId: "t1",
        metadata: null,
      },
      "Ana Jovanović",
    );
    expect(result.labelKey).toBe("work.activity.taskCreated");
    expect(result.actorName).toBe("Ana Jovanović");
  });

  it("falls back to a generic label for an unknown action", () => {
    const result = activityLogToFeedItem(
      {
        id: "1",
        action: "SOMETHING_ELSE",
        actorUserId: null,
        occurredAt: "2026-01-01T00:00:00.000Z",
        caseId: null,
        clientId: null,
        entityType: "Task",
        entityId: "t1",
        metadata: null,
      },
      null,
    );
    expect(result.labelKey).toBe("work.activity.other");
    expect(result.actorName).toBeNull();
  });
});

describe("caseSummaryToPreviewRow", () => {
  it("combines the case with resolved client/user display names", () => {
    const row = caseSummaryToPreviewRow(
      {
        id: "c1",
        caseNumber: "P-1/2026",
        clientId: "cl1",
        name: "Test case",
        status: "ACTIVE",
        priority: "NORMAL",
        responsibleUserId: "u1",
        openedDate: null,
        closedDate: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "Client One",
      "Lawyer One",
    );
    expect(row).toMatchObject({
      caseNumber: "P-1/2026",
      clientName: "Client One",
      responsibleUserName: "Lawyer One",
    });
  });
});
