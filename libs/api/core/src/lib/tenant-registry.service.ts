import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
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
    schemaName: string;
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
      // Auto-provision if workspace exists without tenant mapping (e.g. bootstrap/seed)
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
    schemaName: string;
    status: string;
    storagePrefix: string | null;
  }> {
    const schemaName = `tenant_${workspaceId.replace(/[^a-zA-Z0-9]/g, "_")}`;
    const key = `tenant-${workspaceId.slice(0, 8)}`;
    const storagePrefix = `tenants/${workspaceId}/`;

    await this.provisioner.provisionTenantSchema(schemaName);

    const tenant = await this.platformPrisma.tenant.upsert({
      where: { schemaName },
      update: {
        name: `${workspaceName} Tenant`,
        status: "ACTIVE",
        storagePrefix,
      },
      create: {
        key,
        name: `${workspaceName} Tenant`,
        schemaName,
        status: "ACTIVE",
        storagePrefix,
      },
    });

    await this.platformPrisma.workspace.update({
      where: { id: workspaceId },
      data: { tenantId: tenant.id },
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
