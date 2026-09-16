import { Global, Module } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { PlatformPrismaService, PrismaService } from "./core";
import { WorkspaceContextService } from "./workspace-context";
import { WorkspaceContextInterceptor } from "./workspace-context.interceptor";
import { WorkspaceAccessGuard } from "./workspace-access.guard";

@Global()
@Module({
  providers: [
    PlatformPrismaService,
    PrismaService,
    WorkspaceContextService,
    WorkspaceContextInterceptor,
    WorkspaceAccessGuard,
    {
      provide: APP_INTERCEPTOR,
      useExisting: WorkspaceContextInterceptor,
    },
  ],
  exports: [
    PlatformPrismaService,
    PrismaService,
    WorkspaceContextService,
    WorkspaceContextInterceptor,
    WorkspaceAccessGuard,
  ],
})
export class CoreModule {}
