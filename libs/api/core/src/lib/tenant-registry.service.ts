import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { WorkspaceRole, WorkspaceSummary } from "@law/api-interfaces";
import { PlatformPrismaService } from "./core";
import { TenantSchemaProvisioner } from "./tenant-schema-provisioner";

export interface ResolvedTenantWorkspace {
  workspace: {
    id: string;
    name: string;
    tenantId: string | null;
  };
  tenant: {
    id: string;
    key: string;
    name: string;
    databaseName: string | null;
    status: string;
    storagePrefix: string | null;
  };
}

@Injectable()
export class TenantRegistryService {
  constructor(
    private readonly platformPrisma: PlatformPrismaService,
    private readonly provisioner: TenantSchemaProvisioner,
  ) {}

  async resolveTenantForWorkspace(
    workspaceId: string,
  ): Promise<ResolvedTenantWorkspace> {
    const workspace = await this.platformPrisma.workspace.findUnique({
      where: { id: workspaceId },
      include: { tenant: true },
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    if (!workspace.tenant) {
      const tenant = await this.provisionTenantForWorkspace(
        workspace.id,
        workspace.name,
      );
      return {
        workspace: {
          id: workspace.id,
          name: workspace.name,
          tenantId: tenant.id,
        },
        tenant,
      };
    }

    if (workspace.tenant.status !== "ACTIVE") {
      throw new ForbiddenException("Tenant is not active");
    }
    if (!workspace.tenant.databaseName) {
      throw new ConflictException("Tenant database migration is required");
    }

    return {
      workspace: {
        id: workspace.id,
        name: workspace.name,
        tenantId: workspace.tenantId,
      },
      tenant: workspace.tenant,
    };
  }

  async provisionTenantForWorkspace(
    workspaceId: string,
    workspaceName: string,
  ): Promise<{
    id: string;
    key: string;
    name: string;
    databaseName: string | null;
    status: string;
    storagePrefix: string | null;
  }> {
    const key = `tenant-${workspaceId.slice(0, 8)}`;
    const storagePrefix = `tenants/${workspaceId}/`;
    let tenant = await this.platformPrisma.tenant.findUnique({
      where: { key },
    });

    if (!tenant) {
      const tenantId = randomUUID();
      tenant = await this.platformPrisma.tenant.create({
        data: {
          id: tenantId,
          key,
          name: `${workspaceName} Tenant`,
          databaseName: `law_tenant_${tenantId.replace(/-/g, "_")}`,
          status: "PROVISIONING",
          storagePrefix,
        },
      });
    }

    if (!tenant.databaseName) {
      throw new ConflictException("Tenant database migration is required");
    }

    await this.provisioner.provisionTenantDatabase(
      tenant.id,
      tenant.databaseName,
    );

    tenant = await this.platformPrisma.$transaction(async (tx) => {
      const activeTenant = await tx.tenant.update({
        where: { id: tenant!.id },
        data: {
          name: `${workspaceName} Tenant`,
          status: "ACTIVE",
          storagePrefix,
        },
      });
      await tx.workspace.update({
        where: { id: workspaceId },
        data: { tenantId: activeTenant.id },
      });
      return activeTenant;
    });

    return tenant;
  }

  async listWorkspacesForUser(userId: string): Promise<WorkspaceSummary[]> {
    const memberships = await this.platformPrisma.workspaceMember.findMany({
      where: { userId, status: "ACTIVE" },
      include: {
        workspace: {
          select: {
            id: true,
            name: true,
            tenantId: true,
          },
        },
      },
    });

    return memberships.map((m) => ({
      id: m.workspace.id,
      name: m.workspace.name,
      tenantId: m.workspace.tenantId,
      role: m.role as WorkspaceRole,
    }));
  }
}
