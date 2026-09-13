import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { WorkspaceRole } from "@law/api-interfaces";
import { ReferenceDto } from "./references.dto";
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
  @Get("tags") tags() {
    return this.references.list("tag");
  }
  @Get("case-types") caseTypes() {
    return this.references.list("caseType");
  }
  @Get("practice-areas") practiceAreas() {
    return this.references.list("practiceArea");
  }
  @Post("tags") @WorkspaceAccess(WorkspaceRole.ADMIN) createTag(
    @Body() body: ReferenceDto,
  ) {
    return this.references.create("tag", body);
  }
  @Patch("tags/:id") @WorkspaceAccess(WorkspaceRole.ADMIN) updateTag(
    @Param("id") id: string,
    @Body() body: ReferenceDto,
  ) {
    return this.references.update("tag", id, body);
  }
  @Post("tags/:id/archive") @WorkspaceAccess(WorkspaceRole.ADMIN) archiveTag(
    @Param("id") id: string,
  ) {
    return this.references.setActive("tag", id, false);
  }
  @Post("tags/:id/activate") @WorkspaceAccess(WorkspaceRole.ADMIN) activateTag(
    @Param("id") id: string,
  ) {
    return this.references.setActive("tag", id, true);
  }
  @Post("case-types") @WorkspaceAccess(WorkspaceRole.ADMIN) createCaseType(
    @Body() body: ReferenceDto,
  ) {
    return this.references.create("caseType", body);
  }
  @Patch("case-types/:id") @WorkspaceAccess(WorkspaceRole.ADMIN) updateCaseType(
    @Param("id") id: string,
    @Body() body: ReferenceDto,
  ) {
    return this.references.update("caseType", id, body);
  }
  @Post("case-types/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveCaseType(@Param("id") id: string) {
    return this.references.setActive("caseType", id, false);
  }
  @Post("case-types/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateCaseType(@Param("id") id: string) {
    return this.references.setActive("caseType", id, true);
  }
  @Post("practice-areas")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createPracticeArea(@Body() body: ReferenceDto) {
    return this.references.create("practiceArea", body);
  }
  @Patch("practice-areas/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updatePracticeArea(@Param("id") id: string, @Body() body: ReferenceDto) {
    return this.references.update("practiceArea", id, body);
  }
  @Post("practice-areas/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archivePracticeArea(@Param("id") id: string) {
    return this.references.setActive("practiceArea", id, false);
  }
  @Post("practice-areas/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activatePracticeArea(@Param("id") id: string) {
    return this.references.setActive("practiceArea", id, true);
  }
}
