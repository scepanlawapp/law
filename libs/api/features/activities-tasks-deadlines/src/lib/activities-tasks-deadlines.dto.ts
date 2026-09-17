import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsIn,
  IsString,
  IsUUID,
  MaxLength,
  Validate,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from "class-validator";
import { Type } from "class-transformer";
import { CasePriority } from "@prisma/client";
import { PaginationQueryDto } from "@law/core";
import {
  DeadlineStatus,
  DeadlineType,
  EventStatus,
  EventType,
  NoteType,
  TaskStatus,
} from "@prisma/client";

@ValidatorConstraint({ name: "dateTimeXor", async: false })
class DateTimeXorConstraint implements ValidatorConstraintInterface {
  validate(
    _: unknown,
    args: { object: { dueDate?: string; dueAt?: string } },
  ): boolean {
    return !(args.object.dueDate && args.object.dueAt);
  }
  defaultMessage(): string {
    return "dueDate and dueAt cannot both be provided";
  }
}

@ValidatorConstraint({ name: "dateTimeExactlyOne", async: false })
class DateTimeExactlyOneConstraint implements ValidatorConstraintInterface {
  validate(
    _: unknown,
    args: { object: { dueDate?: string; dueAt?: string } },
  ): boolean {
    return Boolean(args.object.dueDate) !== Boolean(args.object.dueAt);
  }
  defaultMessage(): string {
    return "exactly one of dueDate or dueAt is required";
  }
}

abstract class DueTargetDto {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsDateString() dueAt?: string;
  @Validate(DateTimeXorConstraint)
  private readonly dueTarget?: undefined;
}

export class EventListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(EventType) type?: EventType;
  @IsOptional() @IsEnum(EventStatus) status?: EventStatus;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() userId?: string;
}

export class CreateEventDto {
  @IsEnum(EventType) type!: EventType;
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsString() @MaxLength(80) timeZone!: string;
  @IsOptional() @IsBoolean() isAllDay?: boolean;
  @IsOptional() @IsString() @MaxLength(320) location?: string;
  @IsOptional() @IsString() @MaxLength(2000) meetingUrl?: string;
  @IsOptional() @IsString() @MaxLength(320) courtName?: string;
  @IsOptional() @IsString() @MaxLength(80) courtroom?: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional()
  @IsArray()
  @IsUUID("4", { each: true })
  assigneeUserIds?: string[];
  @IsOptional() @IsArray() @IsUUID("4", { each: true }) clientIds?: string[];
  @IsOptional() @IsArray() attendees?: EventAttendeeDto[];
}

export class UpdateEventDto extends CreateEventDto {}

export class EventAttendeeDto {
  @IsOptional() @IsUUID() clientContactId?: string;
  @IsString() @MaxLength(320) displayName!: string;
  @IsOptional() @IsString() @MaxLength(320) email?: string;
}

export class TaskListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsOptional() @IsUUID() assigneeUserId?: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() deadlineId?: string;
}

export class DeadlineListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(DeadlineStatus) status?: DeadlineStatus;
  @IsOptional() @IsEnum(DeadlineType) type?: DeadlineType;
  @IsOptional() @IsUUID() responsibleUserId?: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
}

export class CreateTaskDto extends DueTargetDto {
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsOptional() @IsEnum(TaskStatus) status?: TaskStatus;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsUUID() assigneeUserId!: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() deadlineId?: string;
}

export class UpdateTaskDto extends CreateTaskDto {}

export class CreateDeadlineDto extends DueTargetDto {
  @Validate(DateTimeExactlyOneConstraint)
  private readonly requiredDueTarget?: undefined;
  @IsString() @MaxLength(320) title!: string;
  @IsOptional() @IsString() @MaxLength(10000) description?: string;
  @IsEnum(DeadlineType) type!: DeadlineType;
  @IsString() @MaxLength(80) timeZone!: string;
  @IsUUID() responsibleUserId!: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsString() @MaxLength(2000) sourceDescription?: string;
}

export class UpdateDeadlineDto extends CreateDeadlineDto {}

export class NoteListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsEnum(NoteType) type?: NoteType;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() eventId?: string;
}

export class CreateNoteDto {
  @IsEnum(NoteType) type!: NoteType;
  @IsString() @MaxLength(10000) body!: string;
  @IsDateString() occurredAt!: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() eventId?: string;
}

export class UpdateNoteDto extends CreateNoteDto {}

export class CalendarQueryDto {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsString() cursor?: string;
  @IsOptional() @Type(() => Number) limit = 100;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsOptional() @IsIn(["EVENT", "TASK", "DEADLINE"]) sourceType?:
    | "EVENT"
    | "TASK"
    | "DEADLINE";
  @IsOptional() @IsString() status?: string;
}

export class ActivityListQueryDto extends PaginationQueryDto {
  @IsOptional() @IsUUID() clientId?: string;
  @IsOptional() @IsUUID() caseId?: string;
}

export class TransitionDto {
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export { DeadlineStatus };
