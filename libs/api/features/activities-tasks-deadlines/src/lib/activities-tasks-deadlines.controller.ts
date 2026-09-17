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
  ActivityListQueryDto,
  CalendarQueryDto,
  CreateDeadlineDto,
  CreateEventDto,
  CreateNoteDto,
  CreateTaskDto,
  DeadlineListQueryDto,
  EventListQueryDto,
  NoteListQueryDto,
  TaskListQueryDto,
  UpdateDeadlineDto,
  UpdateEventDto,
  UpdateNoteDto,
  UpdateTaskDto,
} from "./activities-tasks-deadlines.dto";
import { ActivitiesTasksDeadlinesService } from "./activities-tasks-deadlines.service";

@Controller()
@UseGuards(CsrfOriginGuard, AuthGuard, WorkspaceAccessGuard)
@WorkspaceAccess()
export class ActivitiesTasksDeadlinesController {
  constructor(private readonly service: ActivitiesTasksDeadlinesService) {}

  @Get("events") listEvents(@Query() query: EventListQueryDto) {
    return this.service.listEvents(query);
  }
  @Post("events") createEvent(@Body() body: CreateEventDto) {
    return this.service.createEvent(body);
  }
  @Get("events/:id") getEvent(@Param("id") id: string) {
    return this.service.getEvent(id);
  }
  @Patch("events/:id") updateEvent(
    @Param("id") id: string,
    @Body() body: UpdateEventDto,
  ) {
    return this.service.updateEvent(id, body);
  }
  @Post("events/:id/complete") completeEvent(@Param("id") id: string) {
    return this.service.transitionEvent(id, "COMPLETED");
  }
  @Post("events/:id/cancel") cancelEvent(@Param("id") id: string) {
    return this.service.transitionEvent(id, "CANCELLED");
  }

  @Get("tasks") listTasks(@Query() query: TaskListQueryDto) {
    return this.service.listTasks(query);
  }
  @Post("tasks") createTask(@Body() body: CreateTaskDto) {
    return this.service.createTask(body);
  }
  @Get("tasks/:id") getTask(@Param("id") id: string) {
    return this.service.getTask(id);
  }
  @Patch("tasks/:id") updateTask(
    @Param("id") id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.service.updateTask(id, body);
  }
  @Post("tasks/:id/complete") completeTask(@Param("id") id: string) {
    return this.service.transitionTask(id, "DONE");
  }
  @Post("tasks/:id/cancel") cancelTask(@Param("id") id: string) {
    return this.service.transitionTask(id, "CANCELLED");
  }
  @Post("tasks/:id/reopen") reopenTask(@Param("id") id: string) {
    return this.service.transitionTask(id, "TODO");
  }

  @Get("deadlines") listDeadlines(@Query() query: DeadlineListQueryDto) {
    return this.service.listDeadlines(query);
  }
  @Post("deadlines") createDeadline(@Body() body: CreateDeadlineDto) {
    return this.service.createDeadline(body);
  }
  @Get("deadlines/:id") getDeadline(@Param("id") id: string) {
    return this.service.getDeadline(id);
  }
  @Patch("deadlines/:id") updateDeadline(
    @Param("id") id: string,
    @Body() body: UpdateDeadlineDto,
  ) {
    return this.service.updateDeadline(id, body);
  }
  @Post("deadlines/:id/satisfy") satisfyDeadline(@Param("id") id: string) {
    return this.service.transitionDeadline(id, "SATISFIED");
  }
  @Post("deadlines/:id/cancel") cancelDeadline(@Param("id") id: string) {
    return this.service.transitionDeadline(id, "CANCELLED");
  }
  @Post("deadlines/:id/reopen") reopenDeadline(@Param("id") id: string) {
    return this.service.transitionDeadline(id, "OPEN");
  }

  @Get("notes") listNotes(@Query() query: NoteListQueryDto) {
    return this.service.listNotes(query);
  }
  @Post("notes") createNote(@Body() body: CreateNoteDto) {
    return this.service.createNote(body);
  }
  @Get("notes/:id") getNote(@Param("id") id: string) {
    return this.service.getNote(id);
  }
  @Patch("notes/:id") updateNote(
    @Param("id") id: string,
    @Body() body: UpdateNoteDto,
  ) {
    return this.service.updateNote(id, body);
  }

  @Get("calendar") calendar(@Query() query: CalendarQueryDto) {
    return this.service.calendar(query);
  }
  @Get("activity-log") activity(@Query() query: ActivityListQueryDto) {
    return this.service.listActivity(query);
  }
}
