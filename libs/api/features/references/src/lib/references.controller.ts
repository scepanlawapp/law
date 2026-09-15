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
  @Get("matter-stages") matterStages() {
    return this.references.list("matterStage");
  }
  @Get("participant-roles") participantRoles() {
    return this.references.list("participantRole");
  }
  @Get("proceeding-types") proceedingTypes() {
    return this.references.list("proceedingType");
  }
  @Get("document-categories") documentCategories() {
    return this.references.list("documentCategory");
  }
  @Get("organization-relationship-types") organizationRelationshipTypes() {
    return this.references.list("organizationRelationshipType");
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

  @Post("matter-stages")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createMatterStage(@Body() body: ReferenceDto) {
    return this.references.create("matterStage", body);
  }
  @Patch("matter-stages/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updateMatterStage(@Param("id") id: string, @Body() body: ReferenceDto) {
    return this.references.update("matterStage", id, body);
  }
  @Post("matter-stages/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveMatterStage(@Param("id") id: string) {
    return this.references.setActive("matterStage", id, false);
  }
  @Post("matter-stages/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateMatterStage(@Param("id") id: string) {
    return this.references.setActive("matterStage", id, true);
  }

  @Post("participant-roles")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createParticipantRole(@Body() body: ReferenceDto) {
    return this.references.create("participantRole", body);
  }
  @Patch("participant-roles/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updateParticipantRole(@Param("id") id: string, @Body() body: ReferenceDto) {
    return this.references.update("participantRole", id, body);
  }
  @Post("participant-roles/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveParticipantRole(@Param("id") id: string) {
    return this.references.setActive("participantRole", id, false);
  }
  @Post("participant-roles/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateParticipantRole(@Param("id") id: string) {
    return this.references.setActive("participantRole", id, true);
  }

  @Post("proceeding-types")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createProceedingType(@Body() body: ReferenceDto) {
    return this.references.create("proceedingType", body);
  }
  @Patch("proceeding-types/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updateProceedingType(@Param("id") id: string, @Body() body: ReferenceDto) {
    return this.references.update("proceedingType", id, body);
  }
  @Post("proceeding-types/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveProceedingType(@Param("id") id: string) {
    return this.references.setActive("proceedingType", id, false);
  }
  @Post("proceeding-types/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateProceedingType(@Param("id") id: string) {
    return this.references.setActive("proceedingType", id, true);
  }

  @Post("document-categories")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createDocumentCategory(@Body() body: ReferenceDto) {
    return this.references.create("documentCategory", body);
  }
  @Patch("document-categories/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updateDocumentCategory(@Param("id") id: string, @Body() body: ReferenceDto) {
    return this.references.update("documentCategory", id, body);
  }
  @Post("document-categories/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveDocumentCategory(@Param("id") id: string) {
    return this.references.setActive("documentCategory", id, false);
  }
  @Post("document-categories/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateDocumentCategory(@Param("id") id: string) {
    return this.references.setActive("documentCategory", id, true);
  }

  @Post("organization-relationship-types")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  createOrganizationRelationshipType(@Body() body: ReferenceDto) {
    return this.references.create("organizationRelationshipType", body);
  }
  @Patch("organization-relationship-types/:id")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  updateOrganizationRelationshipType(
    @Param("id") id: string,
    @Body() body: ReferenceDto,
  ) {
    return this.references.update("organizationRelationshipType", id, body);
  }
  @Post("organization-relationship-types/:id/archive")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  archiveOrganizationRelationshipType(@Param("id") id: string) {
    return this.references.setActive("organizationRelationshipType", id, false);
  }
  @Post("organization-relationship-types/:id/activate")
  @WorkspaceAccess(WorkspaceRole.ADMIN)
  activateOrganizationRelationshipType(@Param("id") id: string) {
    return this.references.setActive("organizationRelationshipType", id, true);
  }
}
