import { Body, Controller, Get, Post, Put, UseGuards } from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { RevenueSharingService } from "./revenue-sharing.service";

@Controller("revenue-sharing")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess(WorkspaceRole.ADMIN)
export class RevenueSharingController {
  constructor(private readonly service: RevenueSharingService) {}
  @Get() get() {
    return this.service.get();
  }
  @Put() publish(@Body() body: unknown) {
    return this.service.publish(body);
  }
  @Get("references") references() {
    return this.service.references();
  }
  @Get("history") history() {
    return this.service.history();
  }
  @Post("preview") preview(@Body() body: unknown) {
    return this.service.preview(body);
  }
}
