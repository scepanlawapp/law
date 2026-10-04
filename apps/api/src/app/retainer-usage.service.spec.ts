import { ForbiddenException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { RetainerUsageService, WorkEntriesService } from "@law/work-entries";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const responsibleId = "33333333-3333-4333-a333-333333333333";
const ownerId = "44444444-4444-4444-a444-444444444444";
const clientId = "55555555-5555-4555-a555-555555555555";
const agreementId = "66666666-6666-4666-a666-666666666666";

function inContext<T>(fn: () => T): T {
  return WorkspaceContextService.run(
    { workspaceId, userId, role: WorkspaceRole.OWNER },
    fn,
  );
}

function inRole<T>(role: WorkspaceRole, fn: () => T, user = userId): T {
  return WorkspaceContextService.run({ workspaceId, userId: user, role }, fn);
}

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: agreementId,
    validFrom: new Date("2026-01-01"),
    validTo: null,
    monthlyFee: new Prisma.Decimal("1000.00"),
    currency: "EUR",
    includedMinutes: 600,
    coveredCategoryIds: [],
    overageRule: "HOURLY",
    overageHourlyRate: new Prisma.Decimal("100"),
    outOfScopeRule: "HOURLY",
    outOfScopeHourlyRate: new Prisma.Decimal("100"),
    ...overrides,
  };
}

describe("RetainerUsageService", () => {
  const db = {
    client: { findFirst: jest.fn(), findMany: jest.fn() },
    workEntry: { findMany: jest.fn() },
    workspaceConfig: { findUnique: jest.fn() },
    workspaceMember: { findMany: jest.fn() },
    retainerAgreement: { findMany: jest.fn() },
  };
  const billingSetup = { agreementsForClient: jest.fn() };
  const sent = new Set<string>();
  const notifications = {
    create: jest.fn(),
  };
  const workEntries = {
    afterConfirmed: async () => undefined,
  } as unknown as WorkEntriesService;
  const service = new RetainerUsageService(
    db as never,
    billingSetup as never,
    notifications as never,
    workEntries,
  );
  const workDate = new Date("2026-10-05");
  let covered: { workDate: Date; minutes: number | null; treatment: string }[];

  beforeEach(() => {
    jest.resetAllMocks();
    sent.clear();
    covered = [];
    billingSetup.agreementsForClient.mockResolvedValue([agreement()]);
    db.client.findFirst.mockResolvedValue({
      id: clientId,
      clientNumber: "K-1",
      type: "LEGAL_ENTITY",
      displayName: "Alfa doo",
      status: "ACTIVE",
      responsibleUserId: responsibleId,
    });
    db.workspaceConfig.findUnique.mockResolvedValue({
      targetHourlyRate: new Prisma.Decimal("120"),
    });
    db.workspaceMember.findMany.mockResolvedValue([{ userId: ownerId }]);
    db.workEntry.findMany.mockImplementation(
      async ({ where }: { where: { treatment: { in: string[] } } }) =>
        covered.filter((row) => where.treatment.in.includes(row.treatment)),
    );
    notifications.create.mockImplementation(
      async (input: { userId: string; dedupeKey: string }) => {
        const key = `${input.userId}:${input.dedupeKey}`;
        if (sent.has(key)) return { status: "skipped", reason: "duplicate" };
        sent.add(key);
        return { status: "created" };
      },
    );
  });

  const check = () =>
    inContext(() => service.checkThresholds({ clientId, workDate }));
  const types = () =>
    notifications.create.mock.calls.map(([input]) => input.type);

  describe("checkThresholds", () => {
    it("alerts at 80% once, not again for more minutes, then at 100%", async () => {
      covered = [{ workDate, minutes: 480, treatment: "RETAINER" }];
      await check();
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          workspaceId,
          userId: responsibleId,
          type: "RETAINER_USAGE_80",
          title: "Paušal je iskorišćen 80%",
          dedupeKey: `retainer:${agreementId}:2026-10:80`,
        }),
      );

      covered.push({ workDate, minutes: 30, treatment: "RETAINER" });
      await check();
      // Same dedupe key as before: the service asked again, NotificationsService
      // swallows the duplicate.
      const keys = notifications.create.mock.calls.map(
        ([input]) => input.dedupeKey,
      );
      expect(new Set(keys).size).toBe(1);
      expect(sent.size).toBe(1);

      covered.push({ workDate, minutes: 90, treatment: "RETAINER" });
      await check();
      expect(types()).toContain("RETAINER_USAGE_100");
      expect(notifications.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          type: "RETAINER_USAGE_100",
          title: "Paušal je u potpunosti iskorišćen",
          dedupeKey: `retainer:${agreementId}:2026-10:100`,
        }),
      );
      expect(sent.size).toBe(2);
    });

    it("stays silent below 80%", async () => {
      covered = [{ workDate, minutes: 479, treatment: "RETAINER" }];
      await check();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("stays silent for an uncapped agreement", async () => {
      billingSetup.agreementsForClient.mockResolvedValue([
        agreement({ includedMinutes: null }),
      ]);
      covered = [{ workDate, minutes: 5000, treatment: "RETAINER" }];
      await check();
      expect(notifications.create).not.toHaveBeenCalled();
    });

    it("uses the prorated cap for a part-month agreement", async () => {
      // Active Oct 16-31 = 16 of 31 days: cap floor(600 * 16 / 31) = 309.
      billingSetup.agreementsForClient.mockResolvedValue([
        agreement({ validFrom: new Date("2026-10-16") }),
      ]);
      covered = [
        {
          workDate: new Date("2026-10-20"),
          minutes: 250,
          treatment: "RETAINER",
        },
      ];
      await inContext(() =>
        service.checkThresholds({
          clientId,
          workDate: new Date("2026-10-20"),
        }),
      );
      // 250 / 309 = 81%.
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "RETAINER_USAGE_80" }),
      );
    });

    it("falls back to every active OWNER without a responsible user", async () => {
      db.client.findFirst.mockResolvedValue({
        id: clientId,
        displayName: "Alfa doo",
        responsibleUserId: null,
      });
      covered = [{ workDate, minutes: 600, treatment: "RETAINER" }];
      await check();
      expect(db.workspaceMember.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId, role: "OWNER", status: "ACTIVE" },
        }),
      );
      expect(notifications.create).toHaveBeenCalledTimes(1);
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ownerId,
          type: "RETAINER_USAGE_100",
        }),
      );
    });

    it("does nothing without an agreement on the work date", async () => {
      billingSetup.agreementsForClient.mockResolvedValue([]);
      await check();
      expect(notifications.create).not.toHaveBeenCalled();
    });
  });

  describe("afterConfirmed wiring", () => {
    it("checks thresholds for the confirmed entry's client and date", async () => {
      service.onModuleInit();
      covered = [{ workDate, minutes: 600, treatment: "RETAINER" }];
      await inContext(() =>
        workEntries.afterConfirmed({
          client: { id: clientId },
          workDate: "2026-10-05",
        } as never),
      );
      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({ type: "RETAINER_USAGE_100" }),
      );
    });
  });

  describe("usage", () => {
    it("reports covered, out-of-scope minutes and the effective rate", async () => {
      covered = [
        { workDate, minutes: 300, treatment: "RETAINER" },
        { workDate, minutes: 60, treatment: "RETAINER" },
        { workDate, minutes: 45, treatment: "HOURLY" },
        { workDate, minutes: 15, treatment: "AT" },
        {
          workDate: new Date("2026-10-06"),
          minutes: null,
          treatment: "RETAINER",
        },
      ];
      const usage = await inContext(() => service.usage(clientId, "2026-10"));
      expect(usage).toEqual({
        client: {
          id: clientId,
          clientNumber: "K-1",
          type: "LEGAL_ENTITY",
          displayName: "Alfa doo",
          status: "ACTIVE",
        },
        agreementId,
        month: "2026-10",
        currency: "EUR",
        fee: "1000.00",
        includedMinutes: 600,
        coveredMinutes: 360,
        outOfScopeMinutes: 60,
        // 1000 / 6 h
        effectiveHourlyRate: "166.67",
        targetHourlyRate: "120.00",
      });
      expect(db.workEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            clientId,
            status: { in: ["CONFIRMED", "BILLED"] },
          }),
        }),
      );
    });

    it("has no effective rate when nothing is covered, and a null target when unset", async () => {
      db.workspaceConfig.findUnique.mockResolvedValue(null);
      const usage = await inContext(() => service.usage(clientId, "2026-10"));
      expect(usage).toMatchObject({
        coveredMinutes: 0,
        effectiveHourlyRate: null,
        targetHourlyRate: null,
      });
    });

    it("prorates fee and cap for a part-month agreement", async () => {
      billingSetup.agreementsForClient.mockResolvedValue([
        agreement({ validFrom: new Date("2026-10-16") }),
      ]);
      const usage = await inContext(() => service.usage(clientId, "2026-10"));
      expect(usage).toMatchObject({ fee: "516.13", includedMinutes: 309 });
    });

    it("returns null without an agreement in the month or for an unknown client", async () => {
      expect(
        await inContext(() => service.usage(clientId, "2025-12")),
      ).toBeNull();
      db.client.findFirst.mockResolvedValue(null);
      expect(
        await inContext(() => service.usage(clientId, "2026-10")),
      ).toBeNull();
    });

    it("rejects a malformed month", async () => {
      await expect(
        inContext(() => service.usage(clientId, "2026-13")),
      ).rejects.toThrow("month must be in YYYY-MM format");
    });
  });

  describe("listUsage", () => {
    it("returns usage for each client with an agreement in the month", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([{ clientId }]);
      const rows = await inContext(() => service.listUsage("2026-10"));
      expect(rows).toHaveLength(1);
      expect(rows[0].client.id).toBe(clientId);
      expect(db.retainerAgreement.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ workspaceId, active: true }),
        }),
      );
    });
  });

  describe("viewer access", () => {
    beforeEach(() => {
      db.retainerAgreement.findMany.mockResolvedValue([{ clientId }]);
    });

    it("lets owners and admins see every client", async () => {
      for (const role of [WorkspaceRole.OWNER, WorkspaceRole.ADMIN]) {
        const list = await inRole(role, () =>
          service.listUsageForViewer("2026-10"),
        );
        expect(list).toHaveLength(1);
        const one = await inRole(role, () =>
          service.usageForViewer(clientId, "2026-10"),
        );
        expect(one?.client.id).toBe(clientId);
      }
      expect(db.client.findMany).not.toHaveBeenCalled();
    });

    it("limits a lawyer to the clients they are responsible for", async () => {
      db.client.findMany.mockResolvedValue([{ id: clientId }]);
      const mine = await inRole(
        WorkspaceRole.LAWYER,
        () => service.listUsageForViewer("2026-10"),
        responsibleId,
      );
      expect(mine).toHaveLength(1);
      expect(db.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId, responsibleUserId: responsibleId },
        }),
      );

      db.client.findMany.mockResolvedValue([]);
      const none = await inRole(
        WorkspaceRole.LAWYER,
        () => service.listUsageForViewer("2026-10"),
        userId,
      );
      expect(none).toEqual([]);
    });

    it("gives a lawyer one client's usage only when responsible, else 403", async () => {
      db.client.findFirst.mockImplementation(
        async ({ where }: { where: { responsibleUserId?: string } }) =>
          where.responsibleUserId && where.responsibleUserId !== responsibleId
            ? null
            : {
                id: clientId,
                clientNumber: "K-1",
                type: "LEGAL_ENTITY",
                displayName: "Alfa doo",
                status: "ACTIVE",
                responsibleUserId: responsibleId,
              },
      );

      const own = await inRole(
        WorkspaceRole.LAWYER,
        () => service.usageForViewer(clientId, "2026-10"),
        responsibleId,
      );
      expect(own?.client.id).toBe(clientId);
      await expect(
        inRole(WorkspaceRole.LAWYER, () =>
          service.usageForViewer(clientId, "2026-10"),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuses members", async () => {
      await expect(
        inRole(WorkspaceRole.MEMBER, () =>
          service.listUsageForViewer("2026-10"),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
      await expect(
        inRole(WorkspaceRole.MEMBER, () =>
          service.usageForViewer(clientId, "2026-10"),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});
