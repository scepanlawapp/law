import {
  buildTenantDbUrl,
  TenantConnectionManager,
} from "./tenant-connection-manager";
import { TenantContext, TenantContextService } from "./tenant-context";
import { TenantContextInterceptor } from "./tenant-context.interceptor";
import { TenantSchemaProvisioner } from "./tenant-schema-provisioner";
import { WorkspaceRole } from "@law/api-interfaces";
import { ExecutionContext, CallHandler } from "@nestjs/common";
import { of } from "rxjs";

describe("Multi-tenant Core Components", () => {
  describe("TenantSchemaProvisioner", () => {
    it("provisions tenant schema and custom enum types", async () => {
      const executeRawUnsafe = jest.fn().mockResolvedValue(0);
      const mockTenantClient = { $executeRawUnsafe: executeRawUnsafe };
      const connectionManager = {
        getTenantClient: jest.fn().mockReturnValue(mockTenantClient),
      } as unknown as TenantConnectionManager;

      const provisioner = new TenantSchemaProvisioner(connectionManager);
      await provisioner.provisionTenantSchema("tenant_123");

      expect(connectionManager.getTenantClient).toHaveBeenCalledWith(
        "tenant_123",
      );
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining('CREATE SCHEMA IF NOT EXISTS "tenant_123"'),
      );
      expect(executeRawUnsafe).toHaveBeenCalledWith(
        expect.stringContaining(
          'CREATE TYPE "tenant_123"."ChatSessionStatus" AS ENUM',
        ),
      );
    });

    it("rejects invalid schema names", async () => {
      const provisioner = new TenantSchemaProvisioner({} as never);
      await expect(
        provisioner.provisionTenantSchema("invalid schema!"),
      ).rejects.toThrow("Invalid schema name: invalid schema!");
    });
  });

  describe("buildTenantDbUrl", () => {
    it("appends schema parameter to base database URL", () => {
      const url = buildTenantDbUrl(
        "postgresql://law:law@localhost:5432/law",
        "tenant_abc",
      );
      expect(url).toContain("schema=tenant_abc");
    });

    it("handles URLs that already contain query parameters", () => {
      const url = buildTenantDbUrl(
        "postgresql://law:law@localhost:5432/law?sslmode=disable",
        "tenant_xyz",
      );
      expect(url).toContain("schema=tenant_xyz");
      expect(url).toContain("sslmode=disable");
    });
  });

  describe("TenantContextService", () => {
    it("stores and retrieves tenant context across async boundaries", async () => {
      const mockPrisma = {} as never;
      const context: TenantContext = {
        userId: "user-1",
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        schemaName: "tenant_ws1",
        role: WorkspaceRole.OWNER,
        storagePrefix: "tenants/tenant-1/",
        prisma: mockPrisma,
      };

      const service = new TenantContextService();
      await service.run(context, async () => {
        expect(TenantContextService.current).toEqual(context);
        expect(TenantContextService.required.tenantId).toBe("tenant-1");
        expect(service.current).toEqual(context);
      });

      expect(TenantContextService.current).toBeUndefined();
    });

    it("throws an error when required context is missing", () => {
      expect(() => TenantContextService.required).toThrow(
        "TenantContext is required",
      );
    });
  });

  describe("TenantContextInterceptor", () => {
    it("binds TenantContext to AsyncLocalStorage during request handling", (done) => {
      const mockPrisma = {} as never;
      const context: TenantContext = {
        userId: "user-1",
        workspaceId: "ws-1",
        tenantId: "tenant-1",
        schemaName: "tenant_ws1",
        role: WorkspaceRole.OWNER,
        storagePrefix: "tenants/tenant-1/",
        prisma: mockPrisma,
      };

      const executionContext = {
        switchToHttp: () => ({
          getRequest: () => ({ tenantContext: context }),
        }),
      } as ExecutionContext;

      const next: CallHandler = {
        handle: () => {
          expect(TenantContextService.current).toEqual(context);
          return of("result");
        },
      };

      const interceptor = new TenantContextInterceptor();
      interceptor.intercept(executionContext, next).subscribe({
        next: (val) => {
          expect(val).toBe("result");
        },
        complete: () => {
          done();
        },
      });
      expect(TenantContextService.current).toBeUndefined();
    });
  });
});
