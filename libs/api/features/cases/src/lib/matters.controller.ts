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
import { MatterDetail } from "@law/api-interfaces";
import {
  CreateMatterDto,
  MatterListQueryDto,
  UpdateMatterDto,
} from "./matters.dto";
import { MattersService } from "./matters.service";

@Controller("matters")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class MattersController {
  constructor(private readonly matters: MattersService) {}

  @Get()
  list(@Query() query: MatterListQueryDto) {
    return this.matters.list(query as never);
  }

  @Get(":id")
  get(@Param("id") id: string): Promise<MatterDetail> {
    return this.matters.get(id);
  }

  @Post()
  create(@Body() body: CreateMatterDto): Promise<MatterDetail> {
    return this.matters.create(body as never);
  }

  @Patch(":id")
  update(
    @Param("id") id: string,
    @Body() body: UpdateMatterDto,
  ): Promise<MatterDetail> {
    return this.matters.update(id, body as never);
  }

  @Post(":id/open")
  open(@Param("id") id: string): Promise<MatterDetail> {
    return this.matters.open(id);
  }

  @Post(":id/close")
  close(@Param("id") id: string): Promise<MatterDetail> {
    return this.matters.close(id);
  }

  @Post(":id/archive")
  archive(@Param("id") id: string): Promise<MatterDetail> {
    return this.matters.archive(id);
  }
}
