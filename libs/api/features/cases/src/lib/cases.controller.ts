import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  CaseActivityDto,
  CaseListQueryDto,
  CaseNumberSuggestionQueryDto,
  CaseResponsibilityDto,
  CloseCaseDto,
  CreateCaseDto,
  UpdateCaseActivityDto,
  UpdateCaseDto,
  UpdateCaseResponsibilityDto,
} from "./cases.dto";
import { CasesService } from "./cases.service";

@Controller("cases")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Get() list(@Query() query: CaseListQueryDto) {
    return this.cases.list(query);
  }
  @Get("next-number") nextNumber(@Query() query: CaseNumberSuggestionQueryDto) {
    return this.cases.nextNumberSuggestion(query.format);
  }
  @Post() create(@Body() body: CreateCaseDto) {
    return this.cases.create(body);
  }
  @Get(":caseId") get(@Param("caseId") caseId: string) {
    return this.cases.get(caseId);
  }
  @Patch(":caseId") update(
    @Param("caseId") caseId: string,
    @Body() body: UpdateCaseDto,
  ) {
    return this.cases.update(caseId, body);
  }
  @Post(":caseId/activate") activate(@Param("caseId") caseId: string) {
    return this.cases.transition(caseId, "ACTIVE");
  }
  @Post(":caseId/put-on-hold") putOnHold(@Param("caseId") caseId: string) {
    return this.cases.transition(caseId, "ON_HOLD");
  }
  @Post(":caseId/resume") resume(@Param("caseId") caseId: string) {
    return this.cases.transition(caseId, "ACTIVE");
  }
  @Post(":caseId/close") close(
    @Param("caseId") caseId: string,
    @Body() body: CloseCaseDto,
  ) {
    return this.cases.close(caseId, body);
  }
  @Post(":caseId/reopen") reopen(@Param("caseId") caseId: string) {
    return this.cases.reopen(caseId);
  }
  @Post(":caseId/archive") archive(@Param("caseId") caseId: string) {
    return this.cases.transition(caseId, "ARCHIVED");
  }
  @Get(":caseId/activities") listActivities(@Param("caseId") caseId: string) {
    return this.cases.listActivities(caseId);
  }
  @Post(":caseId/activities") createActivity(
    @Param("caseId") caseId: string,
    @Body() body: CaseActivityDto,
  ) {
    return this.cases.createActivity(caseId, body);
  }
  @Patch(":caseId/activities/:activityId") updateActivity(
    @Param("caseId") caseId: string,
    @Param("activityId") activityId: string,
    @Body() body: UpdateCaseActivityDto,
  ) {
    return this.cases.updateActivity(caseId, activityId, body);
  }
  @Get(":caseId/responsibilities") listResponsibilities(
    @Param("caseId") caseId: string,
  ) {
    return this.cases.listResponsibilities(caseId);
  }
  @Post(":caseId/responsibilities") addResponsibility(
    @Param("caseId") caseId: string,
    @Body() body: CaseResponsibilityDto,
  ) {
    return this.cases.addResponsibility(caseId, body);
  }
  @Patch(":caseId/responsibilities/:responsibilityId") updateResponsibility(
    @Param("caseId") caseId: string,
    @Param("responsibilityId") responsibilityId: string,
    @Body() body: UpdateCaseResponsibilityDto,
  ) {
    return this.cases.updateResponsibility(caseId, responsibilityId, body);
  }
  @Post(":caseId/responsibilities/:responsibilityId/end") endResponsibility(
    @Param("caseId") caseId: string,
    @Param("responsibilityId") responsibilityId: string,
  ) {
    return this.cases.endResponsibility(caseId, responsibilityId);
  }
  @Post(":caseId/responsibilities/:responsibilityId/set-primary") setPrimary(
    @Param("caseId") caseId: string,
    @Param("responsibilityId") responsibilityId: string,
  ) {
    return this.cases.setPrimary(caseId, responsibilityId);
  }
}
