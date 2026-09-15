import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import { LegalLookupSummary } from "@law/api-interfaces";
import {
  LegalLookupCreateDto,
  LegalLookupQueryDto,
  LegalLookupUpdateDto,
  LOOKUP_KINDS,
  LookupKindParam,
} from "./legal-lookups.dto";
import { LegalLookupsService } from "./legal-lookups.service";

@Controller("lookups")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class LegalLookupsController {
  constructor(private readonly lookups: LegalLookupsService) {}

  @Get(":kind")
  list(
    @Param("kind") kind: string,
    @Query() query: LegalLookupQueryDto,
  ): Promise<LegalLookupSummary[]> {
    return this.lookups.list(this.kind(kind), query);
  }

  @Post(":kind")
  create(
    @Param("kind") kind: string,
    @Body() body: LegalLookupCreateDto,
  ): Promise<LegalLookupSummary> {
    return this.lookups.create(this.kind(kind), body);
  }

  @Patch(":kind/:id")
  update(
    @Param("kind") kind: string,
    @Param("id") id: string,
    @Body() body: LegalLookupUpdateDto,
  ): Promise<LegalLookupSummary> {
    return this.lookups.update(this.kind(kind), id, body);
  }

  @Delete(":kind/:id")
  deactivate(
    @Param("kind") kind: string,
    @Param("id") id: string,
  ): Promise<LegalLookupSummary> {
    return this.lookups.deactivate(this.kind(kind), id);
  }

  private kind(value: string): LookupKindParam {
    if ((LOOKUP_KINDS as readonly string[]).includes(value)) {
      return value as LookupKindParam;
    }
    throw new BadRequestException("Unknown lookup kind");
  }
}
