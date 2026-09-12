import {
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import {
  TenantConnectionManager,
  TenantContext,
  TenantContextService,
  TenantRegistryService,
  WorkspaceAccessGuard,
} from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { WorkspacesController } from "./workspaces.controller";

describe("Multi-Tenant Platform Layer Verification", () => {
  let reflector: Reflector;
  let platformPrisma: any;
  let tenantRegistry: TenantRegistryService;
  let connectionManager: TenantConnectionManager;
  let tenantContextService: TenantContextService;
  let guard: WorkspaceAccessGuard;

  beforeEach(() => {
    reflector = new Reflector();
    platformPrisma = {
      workspaceMember: {
        findUnique: jest.fn(),
      },
      workspace: {
        findUnique: jest.fn(),
      },
    };
    tenantRegistry = {
      resolveTenantForWorkspace: jest.fn(),
      listWorkspacesForUser: jest.fn(),
      provisionTenantForWorkspace: jest.fn(),
    } as never;
    connectionManager = {
      getTenantClient: jest.fn(),
    } as never;
    tenantContextService = new TenantContextService();
    guard = new WorkspaceAccessGuard(
      reflector,
      platformPrisma,
      tenantRegistry,
      connectionManager,
      tenantContextService,
    );
  });

  function createMockContext(
    request: Record<string, unknown>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as ExecutionContext;
  }

  describe("Workspace Access & Tenant Resolution", () => {
    it("rejects unauthenticated requests", async () => {
      const context = createMockContext({
        headers: { "x-workspace-id": "ws-1" },
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it("rejects requests missing a workspace ID", async () => {
      const context = createMockContext({
        auth: { user: { id: "user-1" } },
        headers: {},
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects users who are not active members of the requested workspace", async () => {
      platformPrisma.workspaceMember.findUnique.mockResolvedValue(null);

      const context = createMockContext({
        auth: { user: { id: "user-1" } },
        headers: { "x-workspace-id": "ws-other" },
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("rejects members whose status is SUSPENDED or INVITED", async () => {
      platformPrisma.workspaceMember.findUnique.mockResolvedValue({
        workspaceId: "ws-1",
        role: "MEMBER",
        status: "SUSPENDED",
      });

      const context = createMockContext({
        auth: { user: { id: "user-1" } },
        headers: { "x-workspace-id": "ws-1" },
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("resolves tenant and binds TenantContext on successful authorization", async () => {
      platformPrisma.workspaceMember.findUnique.mockResolvedValue({
        workspaceId: "ws-1",
        role: "OWNER",
        status: "ACTIVE",
      });
      (tenantRegistry.resolveTenantForWorkspace as jest.Mock).mockResolvedValue(
        {
          workspace: { id: "ws-1", name: "Alpha Firm", tenantId: "tenant-1" },
          tenant: {
            id: "tenant-1",
            key: "alpha-tenant",
            name: "Alpha Firm Tenant",
            schemaName: "tenant_ws1",
            status: "ACTIVE",
            storagePrefix: "tenants/ws-1/",
          },
        },
      );
      const mockTenantPrisma = { isTenantPrisma: true };
      (connectionManager.getTenantClient as jest.Mock).mockReturnValue(
        mockTenantPrisma,
      );

      const request: any = {
        auth: { user: { id: "user-1" } },
        headers: { "x-workspace-id": "ws-1" },
      };
      const context = createMockContext(request);

      const allowed = await guard.canActivate(context);
      expect(allowed).toBe(true);
      expect(request.workspace).toEqual({
        workspaceId: "ws-1",
        role: WorkspaceRole.OWNER,
      });
      expect(request.tenantContext).toMatchObject({
        userId: "user-1",
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        schemaName: "tenant_ws1",
        role: WorkspaceRole.OWNER,
        storagePrefix: "tenants/ws-1/",
      });
    });
  });

  describe("Concurrent Tenant Context Isolation", () => {
    it("preserves separate tenant contexts across concurrent async operations", async () => {
      const mockPrisma1 = { name: "tenant1-client" } as never;
      const mockPrisma2 = { name: "tenant2-client" } as never;

      const context1: TenantContext = {
        userId: "user-1",
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        schemaName: "tenant_1",
        role: WorkspaceRole.OWNER,
        storagePrefix: "tenants/tenant-1/",
        prisma: mockPrisma1,
      };

      const context2: TenantContext = {
        userId: "user-2",
        workspaceId: "ws-2",
        tenantId: "tenant-2",
        schemaName: "tenant_2",
        role: WorkspaceRole.LAWYER,
        storagePrefix: "tenants/tenant-2/",
        prisma: mockPrisma2,
      };

      const results = await Promise.all([
        tenantContextService.run(context1, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return TenantContextService.current;
        }),
        tenantContextService.run(context2, async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return TenantContextService.current;
        }),
      ]);

      expect(results[0]?.tenantId).toBe("tenant-1");
      expect(results[0]?.schemaName).toBe("tenant_1");
      expect(results[1]?.tenantId).toBe("tenant-2");
      expect(results[1]?.schemaName).toBe("tenant_2");
    });
  });

  describe("WorkspacesController", () => {
    it("returns accessible workspaces for authenticated user", async () => {
      const workspaces = [
        { id: "ws-1", name: "Firm 1", role: WorkspaceRole.OWNER },
        { id: "ws-2", name: "Firm 2", role: WorkspaceRole.LAWYER },
      ];
      (tenantRegistry.listWorkspacesForUser as jest.Mock).mockResolvedValue(
        workspaces,
      );

      const controller = new WorkspacesController(tenantRegistry);
      const result = await controller.listWorkspaces({
        auth: { user: { id: "user-1" } },
      } as never);

      expect(result).toEqual(workspaces);
      expect(tenantRegistry.listWorkspacesForUser).toHaveBeenCalledWith(
        "user-1",
      );
    });
  });
});
