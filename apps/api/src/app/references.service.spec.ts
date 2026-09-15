import { BadRequestException } from "@nestjs/common";
import { TenantContextService } from "@law/core";
import { ReferencesService } from "@law/references";

const workspaceId = "11111111-1111-4111-a111-111111111111";
const userId = "22222222-2222-4222-a222-222222222222";

describe("ReferencesService", () => {
  const db = {
    matterStage: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "stage-1", name: "Discovery" }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "stage-1",
          name: "Discovery",
          workspaceId,
          isActive: true,
        }),
      create: jest
        .fn()
        .mockResolvedValue({
          id: "stage-2",
          name: "Filed",
          workspaceId,
          isActive: true,
        }),
      update: jest
        .fn()
        .mockResolvedValue({
          id: "stage-1",
          name: "Updated",
          workspaceId,
          isActive: true,
        }),
    },
    participantRole: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "role-1", name: "Plaintiff" }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "role-1",
          name: "Plaintiff",
          workspaceId,
          isActive: true,
        }),
      create: jest
        .fn()
        .mockResolvedValue({
          id: "role-2",
          name: "Defendant",
          workspaceId,
          isActive: true,
        }),
      update: jest
        .fn()
        .mockResolvedValue({
          id: "role-1",
          name: "Updated",
          workspaceId,
          isActive: true,
        }),
    },
    proceedingType: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "type-1", name: "Litigation" }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "type-1",
          name: "Litigation",
          workspaceId,
          isActive: true,
        }),
      create: jest
        .fn()
        .mockResolvedValue({
          id: "type-2",
          name: "Appeal",
          workspaceId,
          isActive: true,
        }),
      update: jest
        .fn()
        .mockResolvedValue({
          id: "type-1",
          name: "Updated",
          workspaceId,
          isActive: true,
        }),
    },
    documentCategory: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "doc-1", name: "Court filing" }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "doc-1",
          name: "Court filing",
          workspaceId,
          isActive: true,
        }),
      create: jest
        .fn()
        .mockResolvedValue({
          id: "doc-2",
          name: "Invoice",
          workspaceId,
          isActive: true,
        }),
      update: jest
        .fn()
        .mockResolvedValue({
          id: "doc-1",
          name: "Updated",
          workspaceId,
          isActive: true,
        }),
    },
    organizationRelationshipType: {
      findMany: jest
        .fn()
        .mockResolvedValue([{ id: "org-1", name: "Authorized person" }]),
      findFirst: jest
        .fn()
        .mockResolvedValue({
          id: "org-1",
          name: "Authorized person",
          workspaceId,
          isActive: true,
        }),
      create: jest
        .fn()
        .mockResolvedValue({
          id: "org-2",
          name: "Billing contact",
          workspaceId,
          isActive: true,
        }),
      update: jest
        .fn()
        .mockResolvedValue({
          id: "org-1",
          name: "Updated",
          workspaceId,
          isActive: true,
        }),
    },
    tag: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    caseType: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    practiceArea: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const context = {
    workspaceId,
    userId,
    tenantId: "tenant-1",
    schemaName: "tenant_test",
    role: "OWNER",
    storagePrefix: "tenants/tenant-1/",
    prisma: db,
  };

  const service = new ReferencesService({
    workspaceMember: { findUnique: jest.fn() },
  } as never);

  beforeEach(() => jest.clearAllMocks());

  it("lists matter-related lookup resources in the current workspace", async () => {
    await TenantContextService.run(context as never, async () => {
      const stageResult = await service.list("matterStage" as any);
      const roleResult = await service.list("participantRole" as any);

      expect(stageResult).toEqual([{ id: "stage-1", name: "Discovery" }]);
      expect(roleResult).toEqual([{ id: "role-1", name: "Plaintiff" }]);
      expect(db.matterStage.findMany).toHaveBeenCalledWith({
        where: { workspaceId },
        orderBy: { name: "asc" },
      });
      expect(db.participantRole.findMany).toHaveBeenCalledWith({
        where: { workspaceId },
        orderBy: { name: "asc" },
      });
    });
  });

  it("rejects deactivation of a missing lookup row", async () => {
    db.matterStage.findFirst.mockResolvedValue(null);

    await TenantContextService.run(context as never, async () => {
      await expect(
        service.setActive("matterStage" as any, "missing", false),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });
});
