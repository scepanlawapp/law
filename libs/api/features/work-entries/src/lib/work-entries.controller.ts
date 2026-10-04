import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AuthGuard, CsrfOriginGuard } from "@law/auth";
import { WorkspaceAccess, WorkspaceAccessGuard } from "@law/core";
import {
  ConfirmSourceEntryDto,
  ConfirmWorkEntryDto,
  CreateWorkEntryDto,
  StartTimerDto,
  UpdateWorkEntryDto,
  WorkCaptureParseDto,
  WorkEntryQueryDto,
  WriteOffWorkEntryDto,
} from "./work-entries.dto";
import { WorkCaptureService } from "./work-capture.service";
import { WorkEntriesService } from "./work-entries.service";
import { WorkEntrySourcesService } from "./work-entry-sources.service";

@Controller("work-entries")
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class WorkEntriesController {
  constructor(
    private readonly workEntries: WorkEntriesService,
    private readonly sources: WorkEntrySourcesService,
    private readonly capture: WorkCaptureService,
  ) {}

  @Get()
  list(@Query() query: WorkEntryQueryDto) {
    return this.workEntries.list(query);
  }

  // Fixed-path routes are declared before `:id` so they are never read as an id.
  @Get("timer")
  runningTimer() {
    return this.workEntries.runningTimer();
  }

  @Get("review")
  review(@Query("date") date?: string) {
    return this.workEntries.review(date);
  }

  @Post("timer/start")
  startTimer(@Body() body: StartTimerDto) {
    return this.workEntries.startTimer(body);
  }

  @Post("timer/stop")
  @HttpCode(200)
  stopTimer() {
    return this.workEntries.stopTimer();
  }

  @Post("from-source")
  @HttpCode(200)
  confirmFromSource(@Body() body: ConfirmSourceEntryDto) {
    return this.sources.confirmFromSource(body);
  }

  @Post("parse")
  @HttpCode(200)
  parseCapture(@Body() body: WorkCaptureParseDto) {
    return this.capture.parse(body.text);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.workEntries.get(id);
  }

  @Post()
  create(@Body() body: CreateWorkEntryDto) {
    return this.workEntries.create(body);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() body: UpdateWorkEntryDto) {
    return this.workEntries.update(id, body);
  }

  @Post(":id/confirm")
  @HttpCode(200)
  confirm(@Param("id") id: string, @Body() body: ConfirmWorkEntryDto) {
    return this.workEntries.confirm(id, body);
  }

  @Post(":id/write-off")
  @HttpCode(200)
  writeOff(@Param("id") id: string, @Body() body: WriteOffWorkEntryDto) {
    return this.workEntries.writeOff(id, body.reason);
  }

  @Delete(":id")
  @HttpCode(204)
  async remove(@Param("id") id: string): Promise<void> {
    await this.workEntries.remove(id);
  }
}
