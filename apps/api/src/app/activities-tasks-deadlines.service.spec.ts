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
  const service = new ActivitiesTasksDeadlinesService(db as never);
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
    await expect(run(() =>
      service.createEvent({
        type: "MEETING",
        title: "Meeting",
        startsAt: "2026-09-17T10:00:00.000Z",
        endsAt: "2026-09-17T10:00:00.000Z",
        timeZone: "Europe/Belgrade",
      }),
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a task with both date-only and exact-time targets", async () => {
    await expect(run(() =>
      service.createTask({
        title: "Review",
        assigneeUserId: userId,
        dueDate: "2026-09-18",
        dueAt: "2026-09-18T10:00:00.000Z",
      }),
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("requires exactly one deadline target", async () => {
    await expect(run(() =>
      service.createDeadline({
        title: "Submit response",
        type: "COURT",
        timeZone: "Europe/Belgrade",
        responsibleUserId: userId,
      }),
    )).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects a direct client that does not belong to the supplied case", async () => {
    db.case.findFirst.mockResolvedValue({
      id: caseId,
      clientId: "77777777-7777-4777-a777-777777777777",
    });
    await expect(run(() =>
      service.createTask({
        title: "Review",
        assigneeUserId: userId,
        caseId,
        clientId,
      }),
    )).rejects.toBeInstanceOf(BadRequestException);
  });
});
