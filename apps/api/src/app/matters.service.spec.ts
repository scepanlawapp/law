import { BadRequestException } from "@nestjs/common";
import { TenantContextService } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { MattersService } from "@law/matters";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";

function matterRecord(status: "DRAFT" | "OPEN" | "CLOSED") {
  return {
    id: "33333333-3333-4333-a333-333333333333",
    workspaceId,
    matterNumber: "MT-000001",
    title: "Draft matter",
    status,
    priority: "NORMAL",
    responsibleUserId: userId,
    openedAt: null,
    closedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

describe("MattersService", () => {
  const db = {
    $transaction: jest.fn(async (callback: (transaction: unknown) => unknown) =>
      callback(db),
    ),
    matter: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    matterClient: { findMany: jest.fn() },
    client: { findFirst: jest.fn() },
    domainCounter: { upsert: jest.fn() },
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
  const service = new MattersService(platformPrisma as never);

  beforeEach(() => jest.clearAllMocks());

  it("rejects opening a draft without a title and an active client", async () => {
    db.matter.findFirst.mockResolvedValue({
      ...matterRecord("DRAFT"),
      title: "",
    });
    db.matterClient.findMany.mockResolvedValue([]);

    await TenantContextService.run(context as never, async () => {
      await expect(
        service.open(matterRecord("DRAFT").id),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    expect(db.matter.update).not.toHaveBeenCalled();
  });

  it("creates a draft matter with a generated internal number", async () => {
    db.domainCounter.upsert.mockResolvedValue({ value: 7 });
    db.matter.create.mockImplementation(async ({ data }) => ({
      ...matterRecord("DRAFT"),
      id: "new-id",
      matterNumber: data.matterNumber,
    }));

    await TenantContextService.run(context as never, async () => {
      const result = await service.createDraft({
        title: "New matter",
        description: "Test",
      });
      expect(result.matterNumber).toBe("MT-000007");
    });
  });
});
