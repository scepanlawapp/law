import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";

export function buildTenantDbUrl(
  baseDbUrl: string,
  schemaName: string,
): string {
  if (!baseDbUrl) return "";
  try {
    const url = new URL(baseDbUrl);
    url.searchParams.set("schema", schemaName);
    return url.toString();
  } catch {
    const separator = baseDbUrl.includes("?") ? "&" : "?";
    return `${baseDbUrl}${separator}schema=${encodeURIComponent(schemaName)}`;
  }
}

@Injectable()
export class TenantConnectionManager implements OnModuleDestroy {
  private readonly clients = new Map<string, TenantPrismaClient>();
  private readonly baseDbUrl =
    process.env["TENANT_DATABASE_URL"] ?? process.env["DATABASE_URL"] ?? "";

  getTenantClient(schemaName: string): TenantPrismaClient {
    const existing = this.clients.get(schemaName);
    if (existing) {
      return existing;
    }

    const tenantUrl = buildTenantDbUrl(this.baseDbUrl, schemaName);
    const client = new TenantPrismaClient({
      datasources: {
        db: {
          url: tenantUrl,
        },
      },
    });

    this.clients.set(schemaName, client);
    return client;
  }

  async onModuleDestroy(): Promise<void> {
    const disconnects = Array.from(this.clients.values()).map((client) =>
      client.$disconnect().catch(() => {}),
    );
    await Promise.all(disconnects);
    this.clients.clear();
  }
}
