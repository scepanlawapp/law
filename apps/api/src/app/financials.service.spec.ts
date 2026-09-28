import { ConflictException, ForbiddenException } from "@nestjs/common";
import { WorkspaceContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { FinancialsService } from "@law/financials";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";
const clientId = "33333333-3333-4333-a333-333333333333";
const caseId = "44444444-4444-4444-a444-444444444444";

function client() {
  return {
    id: clientId,
    clientNumber: "CL-000001",
    type: "ORGANIZATION",
    displayName: "Client One",
    status: "ACTIVE",
  };
}

function user() {
  return {
    id: userId,
    firstName: "Ana",
    lastName: "Advokat",
    email: "ana@example.test",
  };
}

function caseRecord() {
  return {
    id: caseId,
    workspaceId,
    clientId,
    caseNumber: "P-1/2026",
    name: "Client matter",
    status: "ACTIVE",
    priority: "NORMAL",
  };
}

describe("FinancialsService", () => {
  const db = {
    client: { findFirst: jest.fn() },
    case: { findFirst: jest.fn() },
    workspaceMember: { findUnique: jest.fn() },
    billingEntry: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      aggregate: jest.fn(),
    },
    billingSuggestionReview: {
      count: jest.fn(),
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    event: { findMany: jest.fn() },
    task: { findMany: jest.fn() },
    deadline: { findMany: jest.fn() },
    caseActivity: { findMany: jest.fn() },
    clientActivity: { findMany: jest.fn() },
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
  const service = new FinancialsService(db as never);

  beforeEach(() => {
    jest.clearAllMocks();
    db.client.findFirst.mockResolvedValue(client());
    db.case.findFirst.mockResolvedValue(caseRecord());
    db.workspaceMember.findUnique.mockResolvedValue({
      status: "ACTIVE",
      user: user(),
    });
    db.billingEntry.findMany.mockResolvedValue([]);
    db.billingEntry.count.mockResolvedValue(0);
    db.billingSuggestionReview.findMany.mockResolvedValue([]);
    db.event.findMany.mockResolvedValue([]);
    db.task.findMany.mockResolvedValue([]);
    db.deadline.findMany.mockResolvedValue([]);
    db.caseActivity.findMany.mockResolvedValue([]);
    db.clientActivity.findMany.mockResolvedValue([]);
    db.billingEntry.create.mockResolvedValue({
      id: "55555555-5555-4555-a555-555555555555",
      client: client(),
      caseLinks: [{ case: caseRecord() }],
      performedBy: user(),
      workStartDate: new Date("2026-09-23"),
      workEndDate: new Date("2026-09-25"),
      kind: "FIXED_FEE",
      disposition: "BILLABLE",
      lifecycle: "DRAFT",
      description: "Review",
      clientDescription: "Legal review",
      durationMinutes: 30,
      amount: { toString: () => "100.00" },
      currency: "RSD",
      sourceType: null,
      sourceId: null,
    });
  });

  it("rejects ordinary members before exposing finance entries", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.MEMBER },
        () => service.listEntries({} as never),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(db.billingEntry.findMany).not.toHaveBeenCalled();
  });

  it("rejects a case belonging to a different client", async () => {
    db.case.findFirst.mockResolvedValue({
      id: caseId,
      workspaceId,
      clientId: "other-client",
    });
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.LAWYER },
        () =>
          service.createEntry({
            clientId,
            caseIds: [caseId],
            workStartDate: "2026-09-23",
            workEndDate: "2026-09-25",
            kind: "FIXED_FEE",
            description: "Review",
            clientDescription: "Legal review",
            amount: 100,
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingEntry.create).not.toHaveBeenCalled();
  });

  it("requires a reason and zero amount for included work", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.LAWYER },
        () =>
          service.createEntry({
            clientId,
            workStartDate: "2026-09-23",
            workEndDate: "2026-09-23",
            kind: "FIXED_FEE",
            disposition: "INCLUDED",
            description: "Call",
            clientDescription: "Included call",
            amount: 25,
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingEntry.create).not.toHaveBeenCalled();
  });

  it("applies repeated client, case, and source filters before listing entries", async () => {
    const otherClientId = "55555555-5555-4555-a555-555555555555";

    await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.listEntries({
          page: 1,
          pageSize: 50,
          clientIds: [clientId, otherClientId],
          caseIds: [caseId],
          sourceTypes: ["EVENT", "TASK"],
        }),
    );

    expect(db.billingEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          clientId: { in: [clientId, otherClientId] },
          caseLinks: { some: { caseId: { in: [caseId] } } },
          sourceType: { in: ["EVENT", "TASK"] },
        }),
      }),
    );
  });

  it("creates a fixed-fee entry for a period and multiple cases", async () => {
    const response = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.LAWYER },
      () =>
        service.createEntry({
          clientId,
          caseIds: [caseId],
          workStartDate: "2026-09-23",
          workEndDate: "2026-09-25",
          kind: "FIXED_FEE",
          description: "Review",
          clientDescription: "Legal review",
          amount: 100,
        }),
    );

    expect(db.billingEntry.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          workStartDate: new Date("2026-09-23"),
          workEndDate: new Date("2026-09-25"),
          caseLinks: {
            create: [{ workspaceId, caseId }],
          },
        }),
      }),
    );
    expect(response).toMatchObject({
      workStartDate: "2026-09-23",
      workEndDate: "2026-09-25",
      cases: [{ id: caseId }],
    });
  });

  it("requires duration only for time-based entries", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.LAWYER },
        () =>
          service.createEntry({
            clientId,
            workStartDate: "2026-09-23",
            workEndDate: "2026-09-23",
            kind: "TIME",
            description: "Review",
            clientDescription: "Legal review",
            amount: 100,
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingEntry.create).not.toHaveBeenCalled();
  });

  it("rejects a work period whose end precedes its start", async () => {
    await expect(
      WorkspaceContextService.run(
        { workspaceId, userId, role: WorkspaceRole.LAWYER },
        () =>
          service.createEntry({
            clientId,
            workStartDate: "2026-09-25",
            workEndDate: "2026-09-23",
            kind: "FIXED_FEE",
            description: "Review",
            clientDescription: "Legal review",
            amount: 100,
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingEntry.create).not.toHaveBeenCalled();
  });

  it("returns only dismissed candidates matching repeated filters", async () => {
    const completedAt = new Date("2026-09-23T10:00:00.000Z");
    db.task.findMany.mockResolvedValue([
      {
        id: "66666666-6666-4666-a666-666666666666",
        title: "Prepare submission",
        completedAt,
        updatedAt: completedAt,
        client: client(),
        case: null,
        assignee: user(),
      },
    ]);
    db.billingSuggestionReview.findMany.mockResolvedValue([
      {
        candidateKey: `TASK:66666666-6666-4666-a666-666666666666:${userId}`,
        resolution: "DISMISSED",
      },
    ]);

    const response = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.listCandidates({
          page: 1,
          pageSize: 50,
          clientIds: [clientId],
          sourceTypes: ["TASK"],
          resolution: "DISMISSED",
        }),
    );

    expect(response.items).toHaveLength(1);
    expect(response.items[0]).toMatchObject({
      sourceType: "TASK",
      resolution: "DISMISSED",
      client: { id: clientId },
    });
  });

  it("dismisses multiple billing candidates in one transaction", async () => {
    const candidateKeys = [
      `TASK:66666666-6666-4666-a666-666666666666:${userId}`,
      `EVENT:77777777-7777-4777-a777-777777777777:${userId}`,
    ];
    db.billingSuggestionReview.upsert
      .mockResolvedValueOnce({ candidateKey: candidateKeys[0] })
      .mockResolvedValueOnce({ candidateKey: candidateKeys[1] });

    const reviews = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () => service.reviewCandidates(candidateKeys, "DISMISSED"),
    );

    expect(reviews).toEqual([
      { candidateKey: candidateKeys[0] },
      { candidateKey: candidateKeys[1] },
    ]);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.billingSuggestionReview.upsert).toHaveBeenCalledTimes(2);
    expect(db.billingSuggestionReview.upsert).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        create: expect.objectContaining({
          candidateKey: candidateKeys[0],
          resolution: "DISMISSED",
          sourceType: "TASK",
        }),
      }),
    );
    expect(db.billingSuggestionReview.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          candidateKey: candidateKeys[1],
          resolution: "DISMISSED",
          sourceType: "EVENT",
        }),
      }),
    );
  });

  it("creates and records one billing entry for every selected candidate", async () => {
    const items = [
      {
        candidateKey: `TASK:66666666-6666-4666-a666-666666666666:${userId}`,
        kind: "TIME" as const,
        durationMinutes: 30,
        amount: 100,
      },
      {
        candidateKey: `EVENT:77777777-7777-4777-a777-777777777777:${userId}`,
        kind: "FIXED_FEE" as const,
        amount: 250,
      },
    ];

    const entries = await WorkspaceContextService.run(
      { workspaceId, userId, role: WorkspaceRole.ADMIN },
      () =>
        service.recordCandidates({
          clientId,
          caseIds: [caseId],
          workStartDate: "2026-09-23",
          workEndDate: "2026-09-25",
          description: "Combined work",
          clientDescription: "Legal services",
          items,
        }),
    );

    expect(entries).toHaveLength(2);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(db.billingEntry.create).toHaveBeenCalledTimes(2);
    expect(db.billingSuggestionReview.upsert).toHaveBeenCalledTimes(2);
    expect(db.billingEntry.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "TIME",
          durationMinutes: 30,
          sourceType: "TASK",
          amount: 100,
        }),
      }),
    );
    expect(db.billingSuggestionReview.upsert).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        create: expect.objectContaining({
          candidateKey: items[1].candidateKey,
          resolution: "RECORDED",
        }),
      }),
    );
  });
});
