import { BadRequestException } from "@nestjs/common";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { CasesService } from "@law/cases";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";

function caseRecord(
  status: "DRAFT" | "ACTIVE" | "ON_HOLD" | "CLOSED" | "ARCHIVED",
) {
  return {
    id: "33333333-3333-4333-a333-333333333333",
    workspaceId,
    caseNumber: "CA-000001",
    clientId: "44444444-4444-4444-a444-444444444444",
    client: {
      id: "44444444-4444-4444-a444-444444444444",
      clientNumber: "CL-000001",
      type: "ORGANIZATION",
      displayName: "Client One",
      status: "ACTIVE",
    },
    name: "Test case",
    status,
    priority: "NORMAL",
    responsibleUserId: userId,
    openedDate: null,
    closedDate: null,
    tags: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("CasesService", () => {
  const platformPrisma = {
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === "function") return arg(platformPrisma);
      if (Array.isArray(arg)) return Promise.all(arg);
      return arg;
    }),
    workspaceMember: { findUnique: jest.fn() },
    user: { findMany: jest.fn() },
    case: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    caseActivity: {
      create: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    caseResponsibility: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const db = platformPrisma;
  const context = {
    workspaceId,
    userId,
    role: WorkspaceRole.OWNER,
  };
  const workEntrySources = {
    ensureForSource: jest.fn(),
    checkRetainerUsage: jest.fn(),
  };
  const service = new CasesService(
    platformPrisma as never,
    workEntrySources as never,
  );

  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-09-16T12:00:00.000Z"));
  });

  afterAll(() => jest.useRealTimers());

  beforeEach(() => {
    jest.clearAllMocks();
    db.user.findMany.mockResolvedValue([
      {
        id: userId,
        firstName: "Ana",
        lastName: "Advokat",
        email: "ana@example.test",
      },
    ]);
  });

  it("scopes detail lookups to the authenticated workspace", async () => {
    db.case.findFirst.mockResolvedValue(null);
    await WorkspaceContextService.run(context as never, async () => {
      await expect(service.get(caseRecord("DRAFT").id)).rejects.toThrow(
        "Case not found",
      );
    });
    expect(db.case.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId }),
      }),
    );
  });

  it("rejects an invalid lifecycle transition without mutating the case", async () => {
    db.case.findFirst.mockResolvedValue(caseRecord("DRAFT"));
    await WorkspaceContextService.run(context as never, async () => {
      await expect(
        service.transition(caseRecord("DRAFT").id, "ON_HOLD"),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
    expect(db.case.update).not.toHaveBeenCalled();
    expect(db.caseActivity.create).not.toHaveBeenCalled();
  });

  it("records a system activity in the same transaction for a valid transition", async () => {
    db.case.findFirst.mockResolvedValue(caseRecord("DRAFT"));
    db.case.update.mockResolvedValue(caseRecord("ACTIVE"));
    db.caseActivity.create.mockResolvedValue({});
    await WorkspaceContextService.run(context as never, async () => {
      await service.transition(caseRecord("DRAFT").id, "ACTIVE");
    });
    expect(db.case.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ACTIVE",
          updatedByUserId: userId,
        }),
      }),
    );
    expect(db.caseActivity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ source: "SYSTEM", workspaceId }),
      }),
    );
  });

  it.each([
    ["YYYY-N", "2026-4", "2026-5"],
    ["YYYY-NNNNN", "2026-00004", "2026-00005"],
    ["CYYYY/NNN", "C2026/004", "C2026/005"],
    ["YYYYC-NN", "2026C-04", "2026C-05"],
    ["PNNNNN-YY", "P00004-26", "P00005-26"],
  ] as const)(
    "suggests the next case number for %s",
    async (format, existing, expected) => {
      db.case.findMany.mockResolvedValue([{ caseNumber: existing }]);

      await WorkspaceContextService.run(context as never, async () => {
        await expect(service.nextNumberSuggestion(format)).resolves.toEqual({
          caseNumber: expected,
        });
      });
    },
  );

  it("continues the sequence when the workspace changes number format", async () => {
    db.case.findMany.mockResolvedValue([{ caseNumber: "CA-000001" }]);

    await WorkspaceContextService.run(context as never, async () => {
      await expect(service.nextNumberSuggestion("YYYY-N")).resolves.toEqual({
        caseNumber: "2026-2",
      });
    });
  });

  it("falls back to the default year-number when number lookup fails", async () => {
    db.case.findMany.mockRejectedValue(new Error("database unavailable"));

    await WorkspaceContextService.run(context as never, async () => {
      await expect(service.nextNumberSuggestion("CYYYY/NNN")).resolves.toEqual({
        caseNumber: "2026-1",
      });
    });
  });

  it("filters cases by the union of clientId and clientIds", async () => {
    db.case.count.mockResolvedValue(0);
    db.case.findMany.mockResolvedValue([]);
    await WorkspaceContextService.run(context as never, async () => {
      await service.list({
        page: 1,
        pageSize: 20,
        clientId: "11111111-1111-4111-a111-111111111111",
        clientIds: [
          "22222222-2222-4222-a222-222222222222",
          "11111111-1111-4111-a111-111111111111",
        ],
      } as never);
    });
    expect(db.case.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          workspaceId,
          clientId: {
            in: [
              "11111111-1111-4111-a111-111111111111",
              "22222222-2222-4222-a222-222222222222",
            ],
          },
        }),
      }),
    );
  });

  it("filters and paginates case activities before returning results", async () => {
    db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
    db.caseActivity.count.mockResolvedValue(12);
    db.caseActivity.findMany.mockResolvedValue([]);

    const result = await WorkspaceContextService.run(context as never, () =>
      service.listActivities(caseRecord("ACTIVE").id, {
        page: 2,
        pageSize: 5,
        search: "poziv",
        types: ["PHONE_CALL", "EMAIL"],
      } as never),
    );

    expect(db.caseActivity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          caseId: caseRecord("ACTIVE").id,
          workspaceId,
          type: { in: ["PHONE_CALL", "EMAIL"] },
          OR: [
            { title: { contains: "poziv", mode: "insensitive" } },
            { description: { contains: "poziv", mode: "insensitive" } },
          ],
        },
        skip: 5,
        take: 5,
      }),
    );
    expect(result.meta).toMatchObject({
      page: 2,
      pageSize: 5,
      totalItems: 12,
      totalPages: 3,
    });
  });

  it("paginates case responsibilities", async () => {
    db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
    db.caseResponsibility.count.mockResolvedValue(11);
    db.caseResponsibility.findMany.mockResolvedValue([]);

    const result = await WorkspaceContextService.run(context as never, () =>
      service.listResponsibilities(caseRecord("ACTIVE").id, {
        page: 2,
        pageSize: 10,
      } as never),
    );

    expect(db.caseResponsibility.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(result.meta).toMatchObject({
      page: 2,
      totalItems: 11,
      totalPages: 2,
    });
  });

  describe("createActivity", () => {
    const activity = (type: string) => ({
      id: "88888888-8888-4888-a888-888888888888",
      workspaceId,
      caseId: caseRecord("ACTIVE").id,
      type,
      title: "Poziv sa klijentom",
      activityDate: new Date("2026-09-16T10:00:00.000Z"),
    });

    it("creates a confirmed entry for a logged call with a duration", async () => {
      db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
      db.caseActivity.create.mockResolvedValue(activity("PHONE_CALL"));
      await WorkspaceContextService.run(context as never, async () => {
        await service.createActivity(caseRecord("ACTIVE").id, {
          type: "PHONE_CALL",
          title: " Poziv sa klijentom ",
          activityDate: "2026-09-16T10:00:00.000Z",
          durationMinutes: 30,
        });
      });
      expect(workEntrySources.ensureForSource).toHaveBeenCalledWith(
        platformPrisma,
        {
          workspaceId,
          actorUserId: userId,
          sourceType: "CASE_ACTIVITY",
          sourceId: activity("PHONE_CALL").id,
          performerUserId: userId,
          clientIds: [caseRecord("ACTIVE").clientId],
          caseId: caseRecord("ACTIVE").id,
          workDate: new Date("2026-09-16T00:00:00.000Z"),
          description: "Poziv sa klijentom",
          minutes: 30,
          confirm: true,
        },
      );
      expect(db.caseActivity.create.mock.calls[0][0].data).not.toHaveProperty(
        "durationMinutes",
      );
    });

    it.each(["MEETING", "EMAIL"])(
      "proposes an entry for a %s logged without a duration",
      async (type) => {
        db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
        db.caseActivity.create.mockResolvedValue(activity(type));
        await WorkspaceContextService.run(context as never, async () => {
          await service.createActivity(caseRecord("ACTIVE").id, {
            type: type as never,
            title: "Poziv sa klijentom",
            activityDate: "2026-09-16T10:00:00.000Z",
          });
        });
        expect(workEntrySources.ensureForSource).toHaveBeenCalledWith(
          platformPrisma,
          expect.objectContaining({ minutes: null, confirm: true }),
        );
      },
    );

    it("checks retainer usage for the case's client after a confirmed entry", async () => {
      db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
      db.caseActivity.create.mockResolvedValue(activity("PHONE_CALL"));
      workEntrySources.ensureForSource.mockResolvedValue("entry-1");
      await WorkspaceContextService.run(context as never, async () => {
        await service.createActivity(caseRecord("ACTIVE").id, {
          type: "PHONE_CALL",
          title: "Poziv sa klijentom",
          activityDate: "2026-09-16T10:00:00.000Z",
          durationMinutes: 30,
        });
      });
      expect(workEntrySources.checkRetainerUsage).toHaveBeenCalledWith(
        caseRecord("ACTIVE").clientId,
        new Date("2026-09-16T00:00:00.000Z"),
      );
    });

    it.each(["NOTE", "OTHER"])("creates no entry for a %s", async (type) => {
      db.case.findFirst.mockResolvedValue(caseRecord("ACTIVE"));
      db.caseActivity.create.mockResolvedValue(activity(type));
      await WorkspaceContextService.run(context as never, async () => {
        await service.createActivity(caseRecord("ACTIVE").id, {
          type: type as never,
          title: "Beleška",
          activityDate: "2026-09-16T10:00:00.000Z",
          durationMinutes: 20,
        });
      });
      expect(workEntrySources.ensureForSource).not.toHaveBeenCalled();
    });
  });
});
