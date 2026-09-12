import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PlatformPrismaService, PrismaService } from "./core";
import { TenantConnectionManager } from "./tenant-connection-manager";
import { TenantContextService } from "./tenant-context";
import { TenantContextInterceptor } from "./tenant-context.interceptor";
import { TenantSchemaProvisioner } from "./tenant-schema-provisioner";
import { TenantRegistryService } from "./tenant-registry.service";
import { WorkspaceAccessGuard } from "./workspace-access.guard";

@Global()
@Module({
  providers: [
    PlatformPrismaService,
    PrismaService,
    TenantConnectionManager,
    TenantContextService,
    TenantContextInterceptor,
    TenantSchemaProvisioner,
    TenantRegistryService,
    WorkspaceAccessGuard,
    {
      provide: APP_INTERCEPTOR,
      useExisting: TenantContextInterceptor,
    },
  ],
  exports: [
    PlatformPrismaService,
    PrismaService,
    TenantConnectionManager,
    TenantContextService,
    TenantContextInterceptor,
    TenantSchemaProvisioner,
    TenantRegistryService,
    WorkspaceAccessGuard,
  ],
})
export class CoreModule {}
