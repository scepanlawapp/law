import { BadRequestException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { ClientsService } from "@law/clients";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";

describe("ClientsService createActivity", () => {
  const db = {
    $transaction: jest.fn(),
    client: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    clientActivity: { create: jest.fn() },
  };
  const workEntrySources = {
    ensureForSource: jest.fn(),
    checkRetainerUsage: jest.fn(),
  };
  const service = new ClientsService(db as never, workEntrySources as never);
  const run = <T>(callback: () => Promise<T>) =>
    WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.OWNER } as never,
      callback,
    );
  const activity = (type: string) => ({
    id: "55555555-5555-4555-a555-555555555555",
    type,
    title: "Sastanak",
    activityDate: new Date("2026-10-04T22:30:00.000Z"),
  });
  const dto = (overrides: Record<string, unknown> = {}) => ({
    type: "MEETING" as const,
    title: " Sastanak ",
    activityDate: "2026-10-04T22:30:00.000Z",
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation((callback) => callback(db));
    db.client.findFirst.mockResolvedValue({ id: clientId });
    db.case.findFirst.mockResolvedValue({ id: caseId });
  });

  it("creates a confirmed entry for a logged meeting on the Belgrade date", async () => {
    db.clientActivity.create.mockResolvedValue(activity("MEETING"));
    await run(() =>
      service.createActivity(
        clientId,
        dto({ durationMinutes: 45, relatedCaseId: caseId }),
      ),
    );
    expect(workEntrySources.ensureForSource).toHaveBeenCalledWith(db, {
      workspaceId,
      actorUserId: userId,
      sourceType: "CLIENT_ACTIVITY",
      sourceId: activity("MEETING").id,
      performerUserId: userId,
      clientIds: [clientId],
      caseId,
      workDate: new Date("2026-10-05T00:00:00.000Z"),
      title: "Sastanak",
      minutes: 45,
      confirm: true,
    });
    expect(db.clientActivity.create.mock.calls[0][0].data).not.toHaveProperty(
      "durationMinutes",
    );
  });

  it("checks retainer usage after the transaction for a confirmed entry", async () => {
    db.clientActivity.create.mockResolvedValue(activity("MEETING"));
    workEntrySources.ensureForSource.mockResolvedValue("entry-1");
    let committed = false;
    db.$transaction.mockImplementation(async (callback) => {
      const result = await callback(db);
      committed = true;
      return result;
    });
    workEntrySources.checkRetainerUsage.mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    await run(() =>
      service.createActivity(clientId, dto({ durationMinutes: 45 })),
    );
    expect(workEntrySources.checkRetainerUsage).toHaveBeenCalledWith(
      clientId,
      new Date("2026-10-05T00:00:00.000Z"),
    );
  });

  it("skips the retainer check for a proposed entry without minutes", async () => {
    db.clientActivity.create.mockResolvedValue(activity("MEETING"));
    workEntrySources.ensureForSource.mockResolvedValue("entry-1");
    await run(() => service.createActivity(clientId, dto()));
    expect(workEntrySources.checkRetainerUsage).not.toHaveBeenCalled();
  });

  it("creates no entry for a note", async () => {
    db.clientActivity.create.mockResolvedValue(activity("NOTE"));
    await run(() => service.createActivity(clientId, dto({ type: "NOTE" })));
    expect(workEntrySources.ensureForSource).not.toHaveBeenCalled();
  });

  it("creates nothing when the related case belongs to another client", async () => {
    db.case.findFirst.mockResolvedValue(null);
    await expect(
      run(() =>
        service.createActivity(clientId, dto({ relatedCaseId: caseId })),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(db.clientActivity.create).not.toHaveBeenCalled();
    expect(workEntrySources.ensureForSource).not.toHaveBeenCalled();
  });
});
