import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./core";
import { WorkspaceAccessGuard } from "./workspace-access.guard";

@Global()
@Module({
  providers: [PrismaService, WorkspaceAccessGuard],
  exports: [PrismaService, WorkspaceAccessGuard],
})
export class CoreModule {}
