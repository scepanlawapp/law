import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspaceContextService } from "@law/core";
import { BillingSetupService, WorkEntriesService } from "@law/work-entries";
import { Prisma } from "@prisma/client";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const otherUserId = "99999999-9999-4999-a999-999999999999";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";
const categoryId = "55555555-5555-4555-a555-555555555555";
const entryId = "66666666-6666-4666-a666-666666666666";

function entryRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: entryId,
    workspaceId,
    userId,
    clientId,
    caseId: null,
    workDate: new Date("2026-10-01"),
    minutes: 30,
    timerStartedAt: null,
    title: "Pregled ugovora",
    description: "",
    serviceCategoryId: null,
    treatment: "UNDECIDED",
    status: "CONFIRMED",
    writeOffReason: null,
    source: "MANUAL",
    sourceType: null,
    sourceId: null,
    invoiceLineId: null,
    aiParsed: false,
    createdByUserId: userId,
    updatedByUserId: userId,
    createdAt: new Date("2026-10-01T08:00:00Z"),
    updatedAt: new Date("2026-10-01T08:00:00Z"),
    user: {
      id: userId,
      firstName: "Ana",
      lastName: "Advokat",
      email: "ana@example.test",
    },
    client: {
      id: clientId,
      clientNumber: "CL-000001",
      type: "ORGANIZATION",
      displayName: "Client One",
      status: "ACTIVE",
    },
    case: null,
    serviceCategory: null,
    invoiceLine: null,
    ...overrides,
  };
}

function agreement(coveredCategoryIds: string[]) {
  return {
    id: "agreement-1",
    validFrom: new Date("2026-01-01"),
    validTo: null,
    monthlyFee: new Prisma.Decimal(1000),
    currency: "EUR",
    includedMinutes: null,
    overageRule: "HOURLY",
    overageHourlyRate: null,
    outOfScopeRule: "AT",
    outOfScopeHourlyRate: null,
    categories: coveredCategoryIds.map((serviceCategoryId) => ({
      serviceCategoryId,
    })),
  };
}

describe("WorkEntriesService", () => {
  const db = {
    $queryRaw: jest.fn(),
    task: { findFirst: jest.fn() },
    client: { findFirst: jest.fn(), findMany: jest.fn() },
    event: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
    },
    document: { findMany: jest.fn() },
    chatSession: { findMany: jest.fn() },
    case: { findFirst: jest.fn() },
    caseResponsibility: { findFirst: jest.fn() },
    serviceCategory: { findFirst: jest.fn() },
    retainerAgreement: { findMany: jest.fn() },
    workEntry: {
      count: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
    activityLog: { create: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
  const service = new WorkEntriesService(
    db as never,
    new BillingSetupService(db as never),
  );

  const as = <R>(
    role: WorkspaceRole,
    fn: () => Promise<R>,
    id: string = userId,
  ) => WorkspaceContextService.run({ userId: id, workspaceId, role }, fn);

  const validCreate = {
    clientId,
    workDate: "2026-10-01",
    minutes: 45,
    title: "Pregled ugovora",
  };

  beforeEach(() => {
    jest.resetAllMocks();
    db.$transaction.mockImplementation(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    });
    db.client.findFirst.mockResolvedValue({ id: clientId });
    db.case.findFirst.mockResolvedValue(null);
    db.serviceCategory.findFirst.mockResolvedValue({ id: categoryId });
    db.retainerAgreement.findMany.mockResolvedValue([]);
    db.workEntry.create.mockImplementation(
      async ({ data }: { data: Record<string, unknown> }) => entryRecord(data),
    );
    db.workEntry.updateMany.mockResolvedValue({ count: 1 });
    db.workEntry.deleteMany.mockResolvedValue({ count: 1 });
    db.workEntry.count.mockResolvedValue(0);
    db.workEntry.findMany.mockResolvedValue([]);
    db.activityLog.create.mockResolvedValue({});
    service.afterConfirmed = async () => undefined;
  });

  describe("task capture", () => {
    const task = { id: "task-1", assigneeUserId: otherUserId };
    it("creates confirmed untimed work for the assignee with task linkage", async () => {
      await as(WorkspaceRole.OWNER, () =>
        service.saveTaskCapture(db as never, task, {
          ...validCreate,
          minutes: null,
        }),
      );
      expect(db.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            userId: otherUserId,
            taskId: "task-1",
            source: "TASK",
            status: "CONFIRMED",
            minutes: null,
          }),
        }),
      );
    });
    it.each(["CONFIRMED", "BILLED", "WRITTEN_OFF", "PROPOSED"])(
      "adds new work without overwriting an existing %s entry",
      async (status) => {
        db.workEntry.findFirst.mockResolvedValue(entryRecord({ status }));
        await as(WorkspaceRole.OWNER, () =>
          service.saveTaskCapture(db as never, task, validCreate),
        );
        expect(db.workEntry.create).toHaveBeenCalled();
        expect(db.workEntry.update).not.toHaveBeenCalled();
      },
    );
    it("can add multiple entries without changing task status", async () => {
      db.task.findFirst.mockResolvedValue({ id: task.id });
      await as(WorkspaceRole.LAWYER, () =>
        service.create({ ...validCreate, taskId: task.id }),
      );
      await as(WorkspaceRole.LAWYER, () =>
        service.create({ ...validCreate, taskId: task.id }),
      );
      expect(db.workEntry.create).toHaveBeenCalledTimes(2);
      expect(db.task.findFirst).toHaveBeenCalledWith({
        where: { id: task.id, workspaceId },
        select: { id: true },
      });
      expect(db.workEntry.create).toHaveBeenLastCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            taskId: task.id,
            source: "TASK",
            userId,
            status: "CONFIRMED",
          }),
        }),
      );
    });
    it("rejects work linked to a task outside the workspace", async () => {
      db.task.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.create({ ...validCreate, taskId: task.id }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });
    it("filters task work without dropping member visibility restrictions", async () => {
      await as(WorkspaceRole.MEMBER, () =>
        service.list({ taskId: task.id, page: 1, pageSize: 50 }),
      );
      expect(db.workEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            workspaceId,
            AND: expect.arrayContaining([{ taskId: task.id }, { userId }]),
          },
        }),
      );
    });
    it("rejects invalid client/case context before writing the entry", async () => {
      db.case.findFirst.mockResolvedValue({
        id: caseId,
        clientId: "another-client",
      });
      await expect(
        as(WorkspaceRole.OWNER, () =>
          service.saveTaskCapture(db as never, task, {
            ...validCreate,
            caseId,
          }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
      expect(db.client.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: clientId, workspaceId } }),
      );
    });
  });

  describe("create", () => {
    it("creates a CONFIRMED entry with the default treatment and logs it", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([
        agreement([categoryId]),
      ]);

      const result = await as(WorkspaceRole.LAWYER, () =>
        service.create({ ...validCreate, serviceCategoryId: categoryId }),
      );

      expect(db.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            workspaceId,
            userId,
            clientId,
            minutes: 45,
            status: "CONFIRMED",
            treatment: "RETAINER",
            source: "MANUAL",
          }),
        }),
      );
      expect(result.status).toBe("CONFIRMED");
      expect(result.treatment).toBe("RETAINER");
      expect(result.workDate).toBe("2026-10-01");
      expect(db.activityLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          workspaceId,
          actorUserId: userId,
          action: "WORK_ENTRY_CREATED",
          entityType: "WORK_ENTRY",
          entityId: entryId,
          clientId,
          caseId: null,
        }),
      });
    });

    it("falls back to UNDECIDED without a retainer and honours an explicit treatment", async () => {
      await as(WorkspaceRole.LAWYER, () => service.create(validCreate));
      expect(db.workEntry.create.mock.calls[0][0].data.treatment).toBe(
        "UNDECIDED",
      );

      db.workEntry.create.mockClear();
      await as(WorkspaceRole.LAWYER, () =>
        service.create({ ...validCreate, treatment: "NON_BILLABLE" }),
      );
      expect(db.workEntry.create.mock.calls[0][0].data.treatment).toBe(
        "NON_BILLABLE",
      );
    });

    it("transliterates the title and description to Serbian Latin", async () => {
      await as(WorkspaceRole.LAWYER, () =>
        service.create({
          ...validCreate,
          title: "Преглед уговора",
          description: "Белешка",
        }),
      );
      const data = db.workEntry.create.mock.calls[0][0].data;
      expect(data.title).toBe("Pregled ugovora");
      expect(data.description).toBe("Beleška");
    });

    it("creates a confirmed untimed entry without a description", async () => {
      await as(WorkspaceRole.LAWYER, () =>
        service.create({ clientId, workDate: "2026-10-01", title: "Overa" }),
      );
      const data = db.workEntry.create.mock.calls[0][0].data;
      expect(data).toEqual(
        expect.objectContaining({
          minutes: null,
          title: "Overa",
          description: "",
          status: "CONFIRMED",
        }),
      );
    });

    it.each(["", "   ", "x".repeat(201)])(
      "rejects the title %j",
      async (title) => {
        await expect(
          as(WorkspaceRole.LAWYER, () =>
            service.create({ ...validCreate, title }),
          ),
        ).rejects.toBeInstanceOf(BadRequestException);
        expect(db.workEntry.create).not.toHaveBeenCalled();
      },
    );

    it.each([0, 1441])("rejects %d minutes", async (minutes) => {
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, minutes }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });

    it("rejects a case that belongs to another client", async () => {
      db.case.findFirst.mockResolvedValue({
        id: caseId,
        clientId: "another-client",
      });
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, caseId }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });

    it("rejects a case outside the workspace", async () => {
      db.case.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, caseId }),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.case.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: caseId, workspaceId } }),
      );
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });

    it("rejects a client outside the workspace", async () => {
      db.client.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.create(validCreate)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.client.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: clientId, workspaceId } }),
      );
    });

    it("marks AI-parsed entries as AI_ASSISTED in the activity log", async () => {
      await as(WorkspaceRole.LAWYER, () =>
        service.create({ ...validCreate, aiParsed: true }),
      );
      expect(db.activityLog.create.mock.calls[0][0].data.metadata).toEqual(
        expect.objectContaining({ source: "AI_ASSISTED" }),
      );
    });

    it("runs the afterConfirmed hook and survives its failure", async () => {
      const hook = jest.fn().mockRejectedValue(new Error("boom"));
      service.afterConfirmed = hook;
      const logSpy = jest
        .spyOn(
          (service as unknown as { logger: { error: () => void } }).logger,
          "error",
        )
        .mockImplementation(() => undefined);

      try {
        await expect(
          as(WorkspaceRole.LAWYER, () => service.create(validCreate)),
        ).resolves.toEqual(expect.objectContaining({ id: entryId }));
        expect(hook).toHaveBeenCalledWith(
          expect.objectContaining({ id: entryId, status: "CONFIRMED" }),
        );
      } finally {
        logSpy.mockRestore();
      }
    });
  });

  describe("past event work", () => {
    const eventId = "11111111-1111-4111-8111-111111111119";
    const event = {
      id: eventId,
      title: "Sastanak",
      description: null,
      status: "COMPLETED",
      startsAt: new Date("2020-01-01T08:00:00Z"),
      endsAt: new Date("2020-01-01T09:00:00Z"),
      isAllDay: false,
      case: null,
      caseId: null,
      clients: [{ clientId }],
    };
    beforeEach(() => {
      db.event.findFirst.mockResolvedValue(event);
      db.workEntry.findFirst.mockResolvedValue(null);
    });
    it.each(["PROPOSED", "CONFIRMED", "BILLED", "WRITTEN_OFF"])(
      "adds work without overwriting existing %s event work",
      async (status) => {
        db.workEntry.findFirst.mockResolvedValue(
          entryRecord({ status, userId: otherUserId }),
        );
        const created = await as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, eventId }),
        );
        expect(created.eventId).toBe(eventId);
        expect(db.workEntry.create).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              eventId,
              source: "EVENT",
              status: "CONFIRMED",
              userId,
            }),
          }),
        );
        expect(db.workEntry.updateMany).not.toHaveBeenCalled();
      },
    );
    it("rejects inaccessible events", async () => {
      db.event.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, eventId }),
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });
    it.each([
      { status: "SCHEDULED", endsAt: new Date("2099-01-01") },
      { status: "CANCELLED" },
    ])("rejects future or cancelled events", async (override) => {
      db.event.findFirst.mockResolvedValue({ ...event, ...override });
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.create({ ...validCreate, eventId }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.writeOffEvent(eventId)),
      ).rejects.toBeInstanceOf(ConflictException);
    });
    it("creates confirmed non-billable work directly without a reason", async () => {
      const work = await as(WorkspaceRole.LAWYER, () =>
        service.writeOffEvent(eventId),
      );
      expect(work).toEqual(
        expect.objectContaining({
          eventId,
          status: "CONFIRMED",
          treatment: "NON_BILLABLE",
          minutes: 60,
          title: "Sastanak",
        }),
      );
      expect(db.event.update).not.toHaveBeenCalled();
      expect(db.activityLog.create).toHaveBeenCalled();
      expect(db.$queryRaw).toHaveBeenCalled();
    });
    it("does not invent a client", async () => {
      db.event.findFirst.mockResolvedValue({ ...event, clients: [] });
      await expect(
        as(WorkspaceRole.LAWYER, () => service.writeOffEvent(eventId)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });
    it("uses the case client and does not invent all-day duration", async () => {
      db.event.findFirst.mockResolvedValue({
        ...event,
        isAllDay: true,
        clients: [],
        case: { clientId },
      });
      const work = await as(WorkspaceRole.LAWYER, () =>
        service.writeOffEvent(eventId),
      );
      expect(work.minutes).toBeNull();
      expect(db.workEntry.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ clientId }),
        }),
      );
    });
    it.each(["CONFIRMED", "PROPOSED", "BILLED"])(
      "prevents duplicate writeoff and preserves %s work",
      async (status) => {
        db.workEntry.findFirst.mockResolvedValue(entryRecord({ status }));
        await expect(
          as(WorkspaceRole.LAWYER, () => service.writeOffEvent(eventId)),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.workEntry.create).not.toHaveBeenCalled();
        expect(db.workEntry.updateMany).not.toHaveBeenCalled();
      },
    );
    it("filters events without work before counting and pagination", async () => {
      db.event.count.mockResolvedValue(0);
      db.event.findMany.mockResolvedValue([]);
      await as(WorkspaceRole.LAWYER, () =>
        service.pastEvents({ page: 2, pageSize: 20 }),
      );
      const where = expect.objectContaining({
        workspaceId,
        endsAt: { lte: expect.any(Date) },
        status: { not: "CANCELLED" },
        workEntries: { none: {} },
        OR: [{ organizerUserId: userId }, { assignees: { some: { userId } } }],
      });
      expect(db.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, skip: 20, take: 20 }),
      );
      expect(db.event.count).toHaveBeenCalledWith({ where });
    });
    it("filters the work list by event in the workspace", async () => {
      await as(WorkspaceRole.OWNER, () =>
        service.list({ eventId, page: 1, pageSize: 50 }),
      );
      expect(db.workEntry.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            AND: expect.arrayContaining([{ eventId }]),
          }),
        }),
      );
    });
  });

  describe("update", () => {
    it("restores written-off work and edits it atomically", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "WRITTEN_OFF", writeOffReason: "Mistake" }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ status: "CONFIRMED", writeOffReason: null }),
      );
      await as(WorkspaceRole.LAWYER, () =>
        service.update(entryId, {
          status: "CONFIRMED",
          title: "Corrected work",
        }),
      );
      expect(db.workEntry.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            status: { in: ["WRITTEN_OFF"] },
          }),
          data: expect.objectContaining({
            status: "CONFIRMED",
            writeOffReason: null,
            title: "Corrected work",
          }),
        }),
      );
      expect(db.activityLog.create).toHaveBeenCalled();
    });

    it.each(["BILLED", "PROPOSED", "RUNNING", "CONFIRMED"] as const)(
      "rejects restoration from %s",
      async (status) => {
        db.workEntry.findFirst.mockResolvedValue(entryRecord({ status }));
        await expect(
          as(WorkspaceRole.LAWYER, () =>
            service.update(entryId, { status: "CONFIRMED" }),
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(db.workEntry.updateMany).not.toHaveBeenCalled();
      },
    );

    it("rejects changes to a BILLED entry with 409", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "BILLED" }),
      );
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.update(entryId, { minutes: 20 }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.workEntry.updateMany).not.toHaveBeenCalled();
    });

    it("only lets managers edit someone else's entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ userId: otherUserId, minutes: 20 }),
      );

      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.update(entryId, { minutes: 20 }),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      const result = await as(WorkspaceRole.ADMIN, () =>
        service.update(entryId, { minutes: 20 }),
      );
      expect(result.minutes).toBe(20);
      expect(db.activityLog.create.mock.calls[0][0].data.action).toBe(
        "WORK_ENTRY_UPDATED",
      );
    });

    it("clears the case when the entry moves to another client", async () => {
      const newClientId = "77777777-7777-4777-a777-777777777777";
      db.client.findFirst.mockResolvedValue({ id: newClientId });
      db.workEntry.findFirst.mockResolvedValue(entryRecord({ caseId }));
      db.workEntry.findUniqueOrThrow.mockResolvedValue(entryRecord());

      await as(WorkspaceRole.LAWYER, () =>
        service.update(entryId, { clientId: newClientId }),
      );

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ clientId: newClientId, caseId: null }),
      );
    });

    it("refreshes the default treatment when the category changes", async () => {
      db.retainerAgreement.findMany.mockResolvedValue([
        agreement([categoryId]),
      ]);
      db.workEntry.findFirst.mockResolvedValue(entryRecord());
      db.workEntry.findUniqueOrThrow.mockResolvedValue(entryRecord());

      await as(WorkspaceRole.LAWYER, () =>
        service.update(entryId, { serviceCategoryId: categoryId }),
      );

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          serviceCategoryId: categoryId,
          treatment: "RETAINER",
        }),
      );
    });
  });

  describe("timer", () => {
    it("maps a unique-index race on start to 409", async () => {
      db.workEntry.findFirst.mockResolvedValue(null);
      db.workEntry.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError("dup", {
          code: "P2002",
          clientVersion: "test",
        }),
      );
      await expect(
        as(WorkspaceRole.LAWYER, () => service.startTimer({ clientId })),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it("returns 404 when stopping without a running timer", async () => {
      db.workEntry.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.LAWYER, () => service.stopTimer()),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuses to start a second timer", async () => {
      db.workEntry.findFirst.mockResolvedValue({ id: "running" });
      await expect(
        as(WorkspaceRole.LAWYER, () => service.startTimer({ clientId })),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.workEntry.create).not.toHaveBeenCalled();
    });

    it("starts a RUNNING TIMER entry without minutes", async () => {
      db.workEntry.findFirst.mockResolvedValue(null);
      await as(WorkspaceRole.LAWYER, () => service.startTimer({ clientId }));
      expect(db.workEntry.create.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: "RUNNING",
          source: "TIMER",
          minutes: null,
          timerStartedAt: expect.any(Date),
        }),
      );
    });

    it("rounds elapsed time up to the next minute on stop and keeps it RUNNING", async () => {
      const startedAt = new Date(Date.now() - 61.2 * 60_000);
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({
          status: "RUNNING",
          minutes: null,
          timerStartedAt: startedAt,
        }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ status: "RUNNING", minutes: 62, timerStartedAt: null }),
      );

      const result = await as(WorkspaceRole.LAWYER, () => service.stopTimer());

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({ minutes: 62, timerStartedAt: null }),
      );
      expect(
        db.workEntry.updateMany.mock.calls[0][0].data.status,
      ).toBeUndefined();
      expect(result.minutes).toBe(62);
      expect(result.status).toBe("RUNNING");
    });
  });

  describe("confirm", () => {
    it("confirms a stopped timer entry and runs the hook", async () => {
      const hook = jest.fn().mockResolvedValue(undefined);
      service.afterConfirmed = hook;
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "RUNNING", minutes: 62 }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ status: "CONFIRMED", minutes: 60 }),
      );

      const result = await as(WorkspaceRole.LAWYER, () =>
        service.confirm(entryId, { minutes: 60 }),
      );

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: "CONFIRMED",
          minutes: 60,
          timerStartedAt: null,
        }),
      );
      expect(db.activityLog.create.mock.calls[0][0].data.action).toBe(
        "WORK_ENTRY_CONFIRMED",
      );
      expect(result.status).toBe("CONFIRMED");
      expect(hook).toHaveBeenCalledTimes(1);
    });

    it("confirms a proposed entry without minutes as untimed work", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "PROPOSED", minutes: null }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ status: "CONFIRMED", minutes: null }),
      );

      await as(WorkspaceRole.LAWYER, () =>
        service.confirm(entryId, { minutes: null, title: "Završen pregled" }),
      );

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: "CONFIRMED",
          minutes: null,
          title: "Završen pregled",
        }),
      );
    });

    it("refuses to confirm a running timer without minutes", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "RUNNING", minutes: null }),
      );
      await expect(
        as(WorkspaceRole.LAWYER, () => service.confirm(entryId, {})),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.updateMany).not.toHaveBeenCalled();
    });

    it("rejects an already confirmed entry with 409", async () => {
      db.workEntry.findFirst.mockResolvedValue(entryRecord());
      await expect(
        as(WorkspaceRole.LAWYER, () =>
          service.confirm(entryId, { minutes: 30 }),
        ),
      ).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe("writeOff", () => {
    it("requires a reason", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () => service.writeOff(entryId, "  ")),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(db.workEntry.findFirst).not.toHaveBeenCalled();
    });

    it("forbids a member from writing off someone else's entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId }),
      );
      await expect(
        as(WorkspaceRole.MEMBER, () => service.writeOff(entryId, "Greška")),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.workEntry.updateMany).not.toHaveBeenCalled();
    });

    it("writes off an own entry with the reason and logs it", async () => {
      db.workEntry.findFirst.mockResolvedValue(entryRecord());
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ status: "WRITTEN_OFF", writeOffReason: "Greška" }),
      );

      const result = await as(WorkspaceRole.MEMBER, () =>
        service.writeOff(entryId, "Greška"),
      );

      expect(db.workEntry.updateMany.mock.calls[0][0].data).toEqual(
        expect.objectContaining({
          status: "WRITTEN_OFF",
          writeOffReason: "Greška",
        }),
      );
      expect(result.writeOffReason).toBe("Greška");
      expect(db.activityLog.create.mock.calls[0][0].data.action).toBe(
        "WORK_ENTRY_WRITTEN_OFF",
      );
    });

    it("lets a manager write off someone else's entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId }),
      );
      db.workEntry.findUniqueOrThrow.mockResolvedValue(
        entryRecord({ userId: otherUserId, status: "WRITTEN_OFF" }),
      );
      await expect(
        as(WorkspaceRole.OWNER, () => service.writeOff(entryId, "Greška")),
      ).resolves.toEqual(expect.objectContaining({ status: "WRITTEN_OFF" }));
    });
  });

  describe("actions", () => {
    it("blocks deleting the task's last entry but still permits editing", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ taskId: "task-1" }),
      );
      db.workEntry.count.mockResolvedValue(1);
      expect(
        await as(WorkspaceRole.OWNER, () => service.actions(entryId)),
      ).toEqual({
        canEdit: true,
        canDelete: false,
        deleteBlockedReason: "LAST_TASK_ENTRY",
      });
      expect(db.workEntry.count).toHaveBeenCalledWith({
        where: { workspaceId, taskId: "task-1" },
      });
    });
    it("permits deletion when another linked entry exists", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ taskId: "task-1" }),
      );
      db.workEntry.count.mockResolvedValue(2);
      expect(
        await as(WorkspaceRole.LAWYER, () => service.actions(entryId)),
      ).toEqual({ canEdit: true, canDelete: true, deleteBlockedReason: null });
    });
    it("keeps readable work from another performer read-only", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId, caseId }),
      );
      db.caseResponsibility.findFirst.mockResolvedValue({
        id: "responsibility",
      });
      expect(
        await as(WorkspaceRole.LAWYER, () => service.actions(entryId)),
      ).toEqual({
        canEdit: false,
        canDelete: false,
        deleteBlockedReason: "NOT_ALLOWED",
      });
    });
    it("rejects action checks for unreadable or foreign-workspace entries", async () => {
      db.workEntry.findFirst.mockResolvedValue(null);
      await expect(
        as(WorkspaceRole.OWNER, () => service.actions(entryId)),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(db.workEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: entryId, workspaceId } }),
      );
    });
    it("keeps billed entries immutable", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "BILLED" }),
      );
      expect(
        await as(WorkspaceRole.OWNER, () => service.actions(entryId)),
      ).toEqual({
        canEdit: false,
        canDelete: false,
        deleteBlockedReason: "BILLED",
      });
    });
  });

  describe("remove", () => {
    it("refuses deletion of the last linked entry without logging a deletion", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ taskId: "task-1" }),
      );
      db.workEntry.count.mockResolvedValue(1);
      const result = as(WorkspaceRole.OWNER, () => service.remove(entryId));
      await expect(result).rejects.toMatchObject({
        response: expect.objectContaining({ code: "LAST_TASK_WORK_ENTRY" }),
      });
      expect(db.$queryRaw).toHaveBeenCalled();
      expect(db.workEntry.deleteMany).not.toHaveBeenCalled();
      expect(db.activityLog.create).not.toHaveBeenCalled();
    });
    it("counts entries after obtaining the shared task lock and preserves the final entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ taskId: "task-1" }),
      );
      db.workEntry.count.mockResolvedValueOnce(2).mockResolvedValueOnce(1);
      await as(WorkspaceRole.OWNER, () => service.remove(entryId));
      await expect(
        as(WorkspaceRole.OWNER, () => service.remove("entry-2")),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.workEntry.deleteMany).toHaveBeenCalledTimes(1);
      expect(db.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        db.workEntry.count.mock.invocationCallOrder[0],
      );
    });
    it("deletes an own entry and logs WORK_ENTRY_DELETED", async () => {
      db.workEntry.findFirst.mockResolvedValue(entryRecord());
      await as(WorkspaceRole.LAWYER, () => service.remove(entryId));
      expect(db.workEntry.deleteMany).toHaveBeenCalled();
      expect(db.activityLog.create.mock.calls[0][0].data.action).toBe(
        "WORK_ENTRY_DELETED",
      );
    });

    it("forbids removing someone else's entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId }),
      );
      await expect(
        as(WorkspaceRole.LAWYER, () => service.remove(entryId)),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(db.workEntry.deleteMany).not.toHaveBeenCalled();
    });

    it("keeps a written-off entry from non-managers but not managers", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "WRITTEN_OFF" }),
      );
      await expect(
        as(WorkspaceRole.MEMBER, () => service.remove(entryId)),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.workEntry.deleteMany).not.toHaveBeenCalled();

      await as(WorkspaceRole.OWNER, () => service.remove(entryId));
      expect(db.workEntry.deleteMany).toHaveBeenCalledTimes(1);
    });

    it("refuses to delete a BILLED entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ status: "BILLED" }),
      );
      await expect(
        as(WorkspaceRole.OWNER, () => service.remove(entryId)),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(db.workEntry.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe("list visibility", () => {
    const query = { page: 1, pageSize: 20 };

    it("forces userId = self for a MEMBER, ignoring requested users", async () => {
      await as(WorkspaceRole.MEMBER, () =>
        service.list({ ...query, userIds: [otherUserId] }),
      );
      const where = db.workEntry.findMany.mock.calls[0][0].where;
      expect(where.workspaceId).toBe(workspaceId);
      expect(where.AND).toEqual([{ userId }]);
    });

    it("returns own or actively-supervised entries for a LAWYER", async () => {
      await as(WorkspaceRole.LAWYER, () => service.list(query));
      const where = db.workEntry.findMany.mock.calls[0][0].where;
      expect(where.AND).toEqual([
        {
          OR: [
            { userId },
            {
              case: {
                responsibilities: { some: { userId, endedAt: null } },
              },
            },
          ],
        },
      ]);
    });

    it("lets managers see everyone and filter by user", async () => {
      await as(WorkspaceRole.ADMIN, () => service.list(query));
      expect(db.workEntry.findMany.mock.calls[0][0].where.AND).toEqual([]);

      await as(WorkspaceRole.OWNER, () =>
        service.list({
          ...query,
          userIds: [otherUserId],
          statuses: ["PROPOSED"],
        }),
      );
      expect(db.workEntry.findMany.mock.calls[1][0].where.AND).toEqual([
        { userId: { in: [otherUserId] } },
        { status: { in: ["PROPOSED"] } },
      ]);
    });

    it("returns pagination metadata", async () => {
      db.workEntry.count.mockResolvedValue(1);
      db.workEntry.findMany.mockResolvedValue([entryRecord()]);
      const result = await as(WorkspaceRole.OWNER, () => service.list(query));
      expect(result.items).toHaveLength(1);
      expect(result.meta.totalItems).toBe(1);
    });
  });

  describe("get", () => {
    it("hides another user's entry from a MEMBER", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId, caseId }),
      );
      await expect(
        as(WorkspaceRole.MEMBER, () => service.get(entryId)),
      ).rejects.toThrow("Work entry not found");
    });

    it("lets a LAWYER read a supervised entry", async () => {
      db.workEntry.findFirst.mockResolvedValue(
        entryRecord({ userId: otherUserId, caseId }),
      );
      db.caseResponsibility.findFirst.mockResolvedValue({ id: "r1" });
      const result = await as(WorkspaceRole.LAWYER, () => service.get(entryId));
      expect(result.id).toBe(entryId);
      expect(db.caseResponsibility.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId, caseId, endedAt: null }),
        }),
      );
    });
  });

  describe("review", () => {
    const eventA = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa";
    const eventB = "bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb";
    const otherClientId = "77777777-7777-4777-a777-777777777777";
    const clientRecord = (id: string, displayName: string) => ({
      id,
      clientNumber: "CL-000002",
      type: "ORGANIZATION",
      displayName,
      status: "ACTIVE",
    });
    const eventRecord = (id: string, title: string) => ({
      id,
      title,
      startsAt: new Date("2026-10-01T08:00:00Z"),
      endsAt: new Date("2026-10-01T09:00:00Z"),
      clients: [],
      case: null,
    });

    beforeEach(() => {
      db.event.findMany.mockResolvedValue([]);
      db.activityLog.findMany.mockResolvedValue([]);
      db.document.findMany.mockResolvedValue([]);
      db.chatSession.findMany.mockResolvedValue([]);
      db.client.findMany.mockResolvedValue([]);
    });

    it("omits an event that already has an entry", async () => {
      db.event.findMany.mockResolvedValue([
        eventRecord(eventA, "Sastanak"),
        eventRecord(eventB, "Ročište"),
      ]);
      // First call: the day's entries, second: proposed, third: event sources.
      db.workEntry.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ eventId: eventA }]);

      const result = await as(WorkspaceRole.LAWYER, () =>
        service.review("2026-10-01"),
      );

      expect(result.missingEvents.map((event) => event.eventId)).toEqual([
        eventB,
      ]);
      expect(db.event.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            status: { not: "CANCELLED" },
            // Belgrade is UTC+2 on 2026-10-01.
            startsAt: {
              gte: new Date("2026-09-30T22:00:00.000Z"),
              lt: new Date("2026-10-01T22:00:00.000Z"),
            },
            OR: [
              { organizerUserId: userId },
              { assignees: { some: { userId } } },
            ],
          }),
        }),
      );
      expect(db.workEntry.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            eventId: { in: [eventA, eventB] },
          }),
        }),
      );
    });

    it("lists a client with activity but no entry, and skips one with an entry", async () => {
      db.workEntry.findMany
        .mockResolvedValueOnce([entryRecord({ clientId: otherClientId })])
        .mockResolvedValueOnce([]);
      db.activityLog.findMany.mockResolvedValue([
        { clientId },
        { clientId: otherClientId },
      ]);
      db.chatSession.findMany.mockResolvedValue([{ case: { clientId } }]);
      db.client.findMany.mockResolvedValue([
        clientRecord(clientId, "Client One"),
      ]);

      const result = await as(WorkspaceRole.LAWYER, () =>
        service.review("2026-10-01"),
      );

      expect(result.entries).toHaveLength(1);
      expect(result.untouchedClients).toEqual([
        {
          client: expect.objectContaining({ id: clientId }),
          reasons: ["ACTIVITY", "CHAT"],
        },
      ]);
      expect(db.client.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { workspaceId, id: { in: [clientId] } },
        }),
      );
      expect(db.activityLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            workspaceId,
            actorUserId: userId,
            clientId: { not: null },
          }),
        }),
      );
    });

    it("rolls document client and case links up to their client", async () => {
      db.document.findMany.mockResolvedValue([
        {
          clients: [{ clientId }],
          cases: [{ case: { clientId: otherClientId } }],
        },
      ]);
      db.client.findMany.mockResolvedValue([
        clientRecord(clientId, "Client One"),
        clientRecord(otherClientId, "Client Two"),
      ]);

      const result = await as(WorkspaceRole.MEMBER, () =>
        service.review("2026-10-01"),
      );

      expect(result.untouchedClients.map((row) => row.reasons)).toEqual([
        ["DOCUMENT"],
        ["DOCUMENT"],
      ]);
    });

    it("returns the user's own entries and open proposals", async () => {
      db.workEntry.findMany
        .mockResolvedValueOnce([entryRecord()])
        .mockResolvedValueOnce([entryRecord({ status: "PROPOSED" })]);

      const result = await as(WorkspaceRole.OWNER, () =>
        service.review("2026-10-01"),
      );

      expect(result.entries[0].status).toBe("CONFIRMED");
      expect(result.proposed[0].status).toBe("PROPOSED");
      expect(db.workEntry.findMany.mock.calls[0][0].where).toEqual({
        workspaceId,
        userId,
        workDate: new Date("2026-10-01T00:00:00Z"),
      });
      expect(db.workEntry.findMany.mock.calls[1][0].where).toEqual({
        workspaceId,
        userId,
        status: "PROPOSED",
      });
    });

    it("defaults to today and rejects a malformed date", async () => {
      await expect(
        as(WorkspaceRole.LAWYER, () => service.review()),
      ).resolves.toMatchObject({ missingEvents: [], untouchedClients: [] });
      for (const bad of ["2026-13-01", "2026-02-30", "yesterday", "2026-1-1"]) {
        await expect(
          as(WorkspaceRole.LAWYER, () => service.review(bad)),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    });
  });
});
