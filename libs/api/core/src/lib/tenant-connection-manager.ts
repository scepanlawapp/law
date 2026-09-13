import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";

export function buildTenantDatabaseUrl(
  baseTenantClusterUrl: string,
  databaseName: string,
): string {
  if (!/^[a-z][a-z0-9_]*$/.test(databaseName)) {
    throw new Error(`Invalid tenant database name: ${databaseName}`);
  }
  if (!baseTenantClusterUrl) return "";
  try {
    const url = new URL(baseTenantClusterUrl);
    url.pathname = `/${databaseName}`;
    url.searchParams.delete("schema");
    return url.toString();
  } catch {
    throw new Error("TENANT_DATABASE_URL must be a valid PostgreSQL URL");
  }
}

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly clients = new Map<string, TenantPrismaClient>();
  private adminClient?: TenantPrismaClient;
  private readonly baseDbUrl = process.env["TENANT_DATABASE_URL"] ?? "";
  private readonly adminDbUrl =
    process.env["TENANT_ADMIN_DATABASE_URL"] ?? this.baseDbUrl;

  getTenantClient(tenantId: string, databaseName: string): TenantPrismaClient {
    const existing = this.clients.get(tenantId);
    if (existing) {
      return existing;
    }

    const tenantUrl = buildTenantDatabaseUrl(this.baseDbUrl, databaseName);
    const client = new TenantPrismaClient({
      datasources: {
        db: {
          url: tenantUrl,
        },
      },
    });

    this.clients.set(tenantId, client);
    return client;
  }

  async createTenantDatabase(databaseName: string): Promise<void> {
    if (!/^[a-z][a-z0-9_]*$/.test(databaseName)) {
      throw new Error(`Invalid tenant database name: ${databaseName}`);
    }
    const admin = this.getAdminClient();
    await admin.$executeRawUnsafe(`CREATE DATABASE "${databaseName}"`);
  }

  private getAdminClient(): TenantPrismaClient {
    if (this.adminClient) return this.adminClient;
    if (!this.adminDbUrl) {
      throw new Error("TENANT_ADMIN_DATABASE_URL is required");
    }
    this.adminClient = new TenantPrismaClient({
      datasources: { db: { url: this.adminDbUrl } },
    });
    return this.adminClient;
  }

  async onModuleDestroy(): Promise<void> {
    const disconnects = Array.from(this.clients.values()).map((client) =>
      client.$disconnect().catch(() => {}),
    );
    if (this.adminClient) disconnects.push(this.adminClient.$disconnect().catch(() => {}));
    await Promise.all(disconnects);
    this.clients.clear();
    this.adminClient = undefined;
  }
}
