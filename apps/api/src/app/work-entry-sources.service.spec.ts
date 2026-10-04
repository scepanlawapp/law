import { NotFoundException } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { WorkEntrySourcesService, workDateFor } from "@law/work-entries";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const performerId = "99999999-9999-4999-a999-999999999999";
const clientA = "33333333-3333-4333-a333-333333333333";
const clientB = "44444444-4444-4444-a444-444444444444";
const caseId = "55555555-5555-4555-a555-555555555555";
const sourceId = "66666666-6666-4666-a666-666666666666";
const entryId = "77777777-7777-4777-a777-777777777777";

describe("WorkEntrySourcesService", () => {
  const tx = {
    workEntry: { findFirst: jest.fn(), create: jest.fn() },
    activityLog: { create: jest.fn() },
  };
  const db = { workEntry: { findFirst: jest.fn() } };
  const workEntries = {
    defaultTreatmentFor: jest.fn(),
    get: jest.fn(),
    confirm: jest.fn(),
  };
  const retainerUsage = { checkThresholds: jest.fn() };
  const service = new WorkEntrySourcesService(
    db as never,
    workEntries as never,
    retainerUsage as never,
  );
  const workDate = new Date("2026-10-04");

  const input = (overrides: Record<string, unknown> = {}) => ({
    workspaceId,
    actorUserId: userId,
    sourceType: "TASK" as const,
    sourceId,
    performerUserId: performerId,
    clientIds: [clientA],
    caseId: null,
    workDate,
    description: "Pregled ugovora",
    minutes: null,
    confirm: false,
    ...overrides,
  });

  beforeEach(() => {
    jest.resetAllMocks();
    tx.workEntry.findFirst.mockResolvedValue(null);
    tx.workEntry.create.mockResolvedValue({ id: entryId });
    tx.activityLog.create.mockResolvedValue({});
    workEntries.defaultTreatmentFor.mockResolvedValue("UNDECIDED");
  });

  describe("ensureForSource", () => {
    it("returns null and writes nothing when no client is known", async () => {
      await expect(
        service.ensureForSource(tx as never, input({ clientIds: [] })),
      ).resolves.toBeNull();
      expect(tx.workEntry.create).not.toHaveBeenCalled();
      expect(tx.activityLog.create).not.toHaveBeenCalled();
    });

    it("returns null and writes nothing when the client is ambiguous", async () => {
      await expect(
        service.ensureForSource(
          tx as never,
          input({ clientIds: [clientA, clientB] }),
        ),
      ).resolves.toBeNull();
      expect(tx.workEntry.create).not.toHaveBeenCalled();
    });

    it("creates a PROPOSED entry for a repeated single client and stays idempotent", async () => {
      const first = await service.ensureForSource(
        tx as never,
        input({ clientIds: [clientA, clientA], caseId }),
      );
      expect(first).toBe(entryId);
      expect(tx.workEntry.create).toHaveBeenCalledTimes(1);
      expect(tx.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            userId: performerId,
            clientId: clientA,
            caseId,
            workDate,
            minutes: null,
            status: "PROPOSED",
            source: "TASK",
            sourceType: "TASK",
            sourceId,
            treatment: "UNDECIDED",
            createdByUserId: userId,
            updatedByUserId: userId,
          }),
        }),
      );
      expect(workEntries.defaultTreatmentFor).toHaveBeenCalledWith(
        clientA,
        workDate,
        null,
        tx,
      );
      expect(tx.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: "WORK_ENTRY_CREATED",
          entityType: "WORK_ENTRY",
          entityId: entryId,
          actorUserId: userId,
          clientId: clientA,
          caseId,
        }),
      });

      tx.workEntry.findFirst.mockResolvedValue({ id: entryId });
      const second = await service.ensureForSource(
        tx as never,
        input({ clientIds: [clientA] }),
      );
      expect(second).toBe(entryId);
      expect(tx.workEntry.create).toHaveBeenCalledTimes(1);
      expect(tx.workEntry.findFirst).toHaveBeenLastCalledWith({
        where: { workspaceId, sourceType: "TASK", sourceId },
        select: { id: true },
      });
    });

    it("creates a CONFIRMED entry when asked to confirm with minutes", async () => {
      await service.ensureForSource(
        tx as never,
        input({
          sourceType: "CASE_ACTIVITY",
          minutes: 30,
          confirm: true,
        }),
      );
      expect(tx.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "CONFIRMED",
            minutes: 30,
            source: "ACTIVITY",
            sourceType: "CASE_ACTIVITY",
          }),
        }),
      );
    });

    it("keeps the entry PROPOSED when confirm is asked without minutes", async () => {
      await service.ensureForSource(
        tx as never,
        input({ sourceType: "CLIENT_ACTIVITY", confirm: true }),
      );
      expect(tx.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "PROPOSED", minutes: null }),
        }),
      );
    });

    it("proposes without minutes when the duration is outside 1-1440", async () => {
      await service.ensureForSource(
        tx as never,
        input({ sourceType: "EVENT", minutes: 2880 }),
      );
      await service.ensureForSource(
        tx as never,
        input({ sourceType: "EVENT", minutes: 0, sourceId: entryId }),
      );
      for (const [args] of tx.workEntry.create.mock.calls) {
        expect(args.data).toEqual(
          expect.objectContaining({ status: "PROPOSED", minutes: null }),
        );
      }
    });

    it("stores the description in Serbian Latin", async () => {
      await service.ensureForSource(
        tx as never,
        input({ description: "  Позив клијенту " }),
      );
      expect(tx.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ description: "Poziv klijentu" }),
        }),
      );
    });
  });

  describe("confirmFromSource", () => {
    const run = <R>(fn: () => Promise<R>) =>
      WorkspaceContextService.run(
        { userId, workspaceId, role: WorkspaceRole.OWNER } as never,
        fn,
      );

    it("confirms the entry with minutes", async () => {
      db.workEntry.findFirst.mockResolvedValue({ id: entryId });
      workEntries.confirm.mockResolvedValue({
        id: entryId,
        status: "CONFIRMED",
      });
      const result = await run(() =>
        service.confirmFromSource({
          sourceType: "TASK",
          sourceId,
          minutes: 45,
          description: "Završen pregled",
        }),
      );
      expect(db.workEntry.findFirst).toHaveBeenCalledWith({
        where: { workspaceId, sourceType: "TASK", sourceId },
        select: { id: true },
      });
      expect(workEntries.confirm).toHaveBeenCalledWith(entryId, {
        minutes: 45,
        description: "Završen pregled",
      });
      expect(result).toEqual({ id: entryId, status: "CONFIRMED" });
    });

    it("leaves the entry PROPOSED when minutes is null", async () => {
      db.workEntry.findFirst.mockResolvedValue({ id: entryId });
      workEntries.get.mockResolvedValue({ id: entryId, status: "PROPOSED" });
      const result = await run(() =>
        service.confirmFromSource({
          sourceType: "EVENT",
          sourceId,
          minutes: null,
        }),
      );
      expect(workEntries.confirm).not.toHaveBeenCalled();
      expect(result).toEqual({ id: entryId, status: "PROPOSED" });
    });

    it("answers 404 when the source produced no entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(null);
      await expect(
        run(() =>
          service.confirmFromSource({
            sourceType: "DEADLINE",
            sourceId,
            minutes: 10,
          }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("checkRetainerUsage", () => {
    it("delegates to the retainer usage service", async () => {
      await service.checkRetainerUsage(clientA, workDate);
      expect(retainerUsage.checkThresholds).toHaveBeenCalledWith({
        clientId: clientA,
        workDate,
      });
    });

    it("swallows a failing check", async () => {
      retainerUsage.checkThresholds.mockRejectedValueOnce(new Error("boom"));
      const logged = jest
        .spyOn(
          (service as unknown as { logger: { error: () => void } }).logger,
          "error",
        )
        .mockImplementation(() => undefined);
      await expect(
        service.checkRetainerUsage(clientA, workDate),
      ).resolves.toBeUndefined();
      expect(logged).toHaveBeenCalled();
    });
  });

  describe("workDateFor", () => {
    it("uses the Belgrade calendar date", () => {
      expect(workDateFor(new Date("2026-10-04T22:30:00Z")).toISOString()).toBe(
        "2026-10-05T00:00:00.000Z",
      );
      expect(workDateFor(new Date("2026-10-04T10:00:00Z")).toISOString()).toBe(
        "2026-10-04T00:00:00.000Z",
      );
    });
  });
});
