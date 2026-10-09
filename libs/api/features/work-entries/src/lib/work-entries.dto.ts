import { Transform } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { PaginationQueryDto } from "@law/core";
import type {
  ConfirmSourceEntryRequest,
  ConfirmWorkEntryRequest,
  CreateWorkEntryRequest,
  StartTimerRequest,
  UpdateWorkEntryRequest,
  WorkCaptureParseRequest,
  WorkEntryQuery,
  WorkEntrySourceType,
  WorkEntryStatus,
  WorkEntryTreatment,
} from "@law/api-interfaces";

export const WORK_ENTRY_STATUSES = [
  "RUNNING",
  "PROPOSED",
  "CONFIRMED",
  "BILLED",
  "WRITTEN_OFF",
] as const;
export const WORK_ENTRY_TREATMENTS = [
  "RETAINER",
  "AT",
  "HOURLY",
  "NON_BILLABLE",
  "UNDECIDED",
] as const;

export const WORK_ENTRY_SOURCE_TYPES = [
  "TASK",
  "EVENT",
  "DEADLINE",
  "CLIENT_ACTIVITY",
  "CASE_ACTIVITY",
] as const;

const toArray = ({ value }: { value: unknown }): string[] | undefined =>
  value === undefined
    ? undefined
    : Array.isArray(value)
      ? value
      : [value as string];

const toBoolean = ({ value }: { value: unknown }): boolean | undefined =>
  value === undefined ? undefined : value === true || value === "true";

export class CreateWorkEntryDto implements CreateWorkEntryRequest {
  @IsOptional() @IsUUID() userId?: string | null;
  @IsOptional() @IsUUID() eventId?: string;
  @IsOptional()
  @IsUUID()
  taskId?: string;
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsISO8601()
  workDate!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number | null;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsOptional()
  @IsIn(WORK_ENTRY_TREATMENTS)
  treatment?: WorkEntryTreatment;

  @IsOptional()
  @IsIn(["MANUAL", "QUICK_CAPTURE"])
  source?: "MANUAL" | "QUICK_CAPTURE";

  @IsOptional()
  @IsBoolean()
  aiParsed?: boolean;
}

export class UpdateWorkEntryDto implements UpdateWorkEntryRequest {
  @IsOptional() @IsUUID() userId?: string | null;
  @IsOptional() @IsIn(["CONFIRMED"]) status?: "CONFIRMED";
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsISO8601()
  workDate?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID()
  serviceCategoryId?: string;

  @IsOptional()
  @IsIn(WORK_ENTRY_TREATMENTS)
  treatment?: WorkEntryTreatment;

  @IsOptional()
  @IsIn(["MANUAL", "QUICK_CAPTURE"])
  source?: "MANUAL" | "QUICK_CAPTURE";

  @IsOptional()
  @IsBoolean()
  aiParsed?: boolean;
}

export class ConfirmWorkEntryDto implements ConfirmWorkEntryRequest {
  @IsOptional() @IsUUID() userId?: string | null;
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes?: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WriteOffWorkEntryDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}

export class StartTimerDto implements StartTimerRequest {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkEntryQueryDto
  extends PaginationQueryDto
  implements WorkEntryQuery
{
  @IsOptional()
  @IsUUID()
  eventId?: string;
  @IsOptional()
  @IsUUID()
  taskId?: string;
  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  userIds?: string[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsUUID("4", { each: true })
  clientIds?: string[];

  @IsOptional()
  @IsUUID()
  caseId?: string;

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(WORK_ENTRY_STATUSES, { each: true })
  statuses?: WorkEntryStatus[];

  @IsOptional()
  @Transform(toArray)
  @IsArray()
  @IsIn(WORK_ENTRY_TREATMENTS, { each: true })
  treatments?: WorkEntryTreatment[];

  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unbilledOnly?: boolean;
}

export class ConfirmSourceEntryDto implements ConfirmSourceEntryRequest {
  @IsOptional() @IsUUID() userId?: string | null;
  @IsIn(WORK_ENTRY_SOURCE_TYPES)
  sourceType!: WorkEntrySourceType;

  @IsUUID()
  sourceId!: string;

  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1440)
  minutes!: number | null;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class WorkCaptureParseDto implements WorkCaptureParseRequest {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  text!: string;
}
