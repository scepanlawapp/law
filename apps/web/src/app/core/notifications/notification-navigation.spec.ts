import type { NotificationDto } from "@law/api-interfaces";
import { notificationTarget } from "./notification-navigation";

function notification(overrides: Partial<NotificationDto>): NotificationDto {
  return {
    id: "n1",
    type: "TASK_ASSIGNED",
    title: "t",
    message: "m",
    entityType: null,
    entityId: null,
    metadata: null,
    isRead: false,
    readAt: null,
    createdAt: "2026-10-04T10:00:00.000Z",
    ...overrides,
  };
}

describe("notificationTarget", () => {
  it("routes time notifications", () => {
    expect(
      notificationTarget(notification({ type: "TIME_REVIEW_REMINDER" })),
    ).toEqual({ commands: ["/work/time/review"] });
    expect(
      notificationTarget(notification({ type: "TIMER_RUNNING_LONG" })),
    ).toEqual({ commands: ["/work/time"] });
  });

  it("routes retainer usage to the client or finance", () => {
    expect(
      notificationTarget(
        notification({
          type: "RETAINER_USAGE_80",
          metadata: { clientId: "c1" },
        }),
      ),
    ).toEqual({ commands: ["/clients", "c1"] });
    expect(
      notificationTarget(notification({ type: "RETAINER_USAGE_100" })),
    ).toEqual({ commands: ["/finance"] });
  });

  it("keeps task and calendar navigation", () => {
    expect(
      notificationTarget(notification({ entityType: "TASK", message: "x" })),
    ).toEqual({ commands: ["/work/my"], queryParams: { search: "x" } });
    expect(
      notificationTarget(
        notification({
          type: "EVENT_CHANGED",
          entityType: "EVENT",
          metadata: { startsAt: "2026-10-05T09:00:00.000Z" },
        }),
      ),
    ).toEqual({
      commands: ["/calendar"],
      queryParams: { view: "list", date: "2026-10-05" },
    });
  });
});
