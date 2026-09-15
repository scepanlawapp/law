import {
  Body,
  Controller,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { CreateMatterDto, OpenMatterDto, UpdateMatterDto } from "./matters.dto";
import { MattersService } from "./matters.service";

@Controller("matters")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class MattersController {
  constructor(private readonly matters: MattersService) {}

  @Post() create(@Body() body: CreateMatterDto) {
    return this.matters.createDraft(body);
  }

  @Patch(":matterId") update(
    @Param("matterId") matterId: string,
    @Body() body: UpdateMatterDto,
  ) {
    return this.matters.update(matterId, body);
  }

  @Post(":matterId/open") open(
    @Param("matterId") matterId: string,
    @Body() body: OpenMatterDto,
  ) {
    return this.matters.open(matterId);
  }
}
