import { BadRequestException } from "@nestjs/common";
import { TenantContextService } from "@law/core";
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
  const db = {
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(db),
    ),
    case: { findFirst: jest.fn(), update: jest.fn() },
    caseActivity: { create: jest.fn() },
  };
  const platformPrisma = { workspaceMember: { findUnique: jest.fn() } };
  const context = {
    workspaceId,
    userId,
    tenantId: "tenant-1",
    schemaName: "tenant_test",
    role: WorkspaceRole.OWNER,
    storagePrefix: "tenants/tenant-1/",
    prisma: db,
  };
  const service = new CasesService(platformPrisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("scopes detail lookups to the authenticated workspace", async () => {
    db.case.findFirst.mockResolvedValue(null);
    await TenantContextService.run(context as never, async () => {
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
    await TenantContextService.run(context as never, async () => {
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
    await TenantContextService.run(context as never, async () => {
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
});
