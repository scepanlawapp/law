import { AsyncLocalStorage } from "node:async_hooks";
import { Injectable } from "@nestjs/common";
import { WorkspaceRole } from "@law/api-interfaces";
import { PrismaClient as TenantPrismaClient } from "@prisma/tenant-client";

export interface TenantContext {
  userId: string;
  workspaceId: string;
  tenantId: string;
  schemaName: string;
  role: WorkspaceRole;
  storagePrefix: string;
  prisma: TenantPrismaClient;
}

@Injectable()
export class TenantContextService {
  private static readonly storage = new AsyncLocalStorage<TenantContext>();

  static get current(): TenantContext | undefined {
    return this.storage.getStore();
  }

  static get required(): TenantContext {
    const context = this.current;
    if (!context) {
      throw new Error(
        "TenantContext is required but not initialized for the current execution",
      );
    }
    return context;
  }

  static getPrisma(): TenantPrismaClient {
    return this.required.prisma;
  }

  static run<R>(context: TenantContext, fn: () => R): R {
    return this.storage.run(context, fn);
  }

  run<R>(context: TenantContext, fn: () => R): R {
    return TenantContextService.storage.run(context, fn);
  }

  enterWith(context: TenantContext): void {
    TenantContextService.storage.enterWith(context);
  }

  get current(): TenantContext | undefined {
    return TenantContextService.current;
  }

  get required(): TenantContext {
    return TenantContextService.required;
  }

  getPrisma(): TenantPrismaClient {
    return TenantContextService.getPrisma();
  }
}
