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
    $transaction: jest.fn(async (input: unknown) => {
      if (typeof input === "function") return input(db);
      return Promise.all(input as Promise<unknown>[]);
    }),
  };
  const service = new FinancialsService(db as never);

  beforeEach(() => {
    jest.clearAllMocks();
    db.client.findFirst.mockResolvedValue(client());
    db.case.findFirst.mockResolvedValue({ id: caseId, workspaceId, clientId });
    db.workspaceMember.findUnique.mockResolvedValue({
      status: "ACTIVE",
      user: user(),
    });
    db.billingEntry.create.mockResolvedValue({
      id: "55555555-5555-4555-a555-555555555555",
      client: client(),
      case: null,
      performedBy: user(),
      workDate: new Date("2026-09-23"),
      kind: "TIME",
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
            caseId,
            workDate: "2026-09-23",
            kind: "TIME",
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
            workDate: "2026-09-23",
            kind: "TIME",
            disposition: "INCLUDED",
            description: "Call",
            clientDescription: "Included call",
            amount: 25,
          }),
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(db.billingEntry.create).not.toHaveBeenCalled();
  });
});
