import { Controller, Get, Query, UseGuards } from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { ReferencesService } from "./references.service";
import { UserSearchQueryDto } from "./user-search.dto";

@Controller("references")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ReferencesController {
  constructor(private readonly references: ReferencesService) {}
  @Get("users") users() {
    return this.references.users();
  }
  @Get("users/search") userSearch(@Query() query: UserSearchQueryDto) {
    return this.references.userSearch(query.q, query.limit);
  }
  @Get("countries") countries() {
    return this.references.countries();
  }
}
