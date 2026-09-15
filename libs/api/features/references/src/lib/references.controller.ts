import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { ReferencesService } from "./references.service";

@Controller("references")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ReferencesController {
  constructor(private readonly references: ReferencesService) {}
  @Get("users") users() {
    return this.references.users();
  }
  @Get("countries") countries() {
    return this.references.countries();
  }
}
